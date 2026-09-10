import 'server-only';

import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {EVIDENCE_BUCKET, trustedDatabase} from '@/lib/ops/server';
import {classifyDatabaseError, OpsError, type Scope} from '@/lib/ops/contracts';
import {evidenceContentViolation} from '@/lib/intelligence/evidence-validation';
import {
  canStageMcpSourceFamily,
  isNonPublicIpAddress,
  mcpFileStableIdentity,
  openAiFileSchema,
  type McpStagedSource,
  type McpSourceFamily,
  type OpenAiFile,
} from './contracts';
import {validatedMcpFileMetadata} from './file-content';
import type {McpPrincipal} from './auth';

export {openAiFileSchema};
export type {OpenAiFile};
export type StagedMcpFile = McpStagedSource;

export const MCP_FILE_LIMIT = 50 * 1024 * 1024;

async function assertPublicHttps(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
    throw new OpsError('validation', 'File references must use a standard public HTTPS download address.');
  }
  const hostname = url.hostname.toLowerCase();
  const configuredHosts = (process.env.MINERALX_MCP_FILE_HOSTS || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !configuredHosts.length) {
    throw new OpsError('unavailable', 'ChatGPT file transfer is paused until its download host allowlist is configured.');
  }
  if (configuredHosts.length && !configuredHosts.some((entry) => {
    const suffix = entry.startsWith('*.') ? entry.slice(2) : entry;
    return hostname === suffix || entry.startsWith('*.') && hostname.endsWith(`.${suffix}`);
  })) throw new OpsError('validation', 'The uploaded file reference is not from an approved provider host.');
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new OpsError('validation', 'Private network file references are not accepted.');
  }
  const lookupHostname = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (isIP(lookupHostname)) {
    if (isNonPublicIpAddress(lookupHostname)) throw new OpsError('validation', 'Private network file references are not accepted.');
  } else {
    let addresses;
    try { addresses = await lookup(lookupHostname, {all: true, verbatim: true}); }
    catch { throw new OpsError('unavailable', 'The uploaded file reference could not be resolved.'); }
    if (!addresses.length || addresses.some(({address}) => isNonPublicIpAddress(address))) {
      throw new OpsError('validation', 'The uploaded file reference resolved to a private network.');
    }
  }
  return url;
}

async function downloadBoundedFile(source: OpenAiFile) {
  let url = await assertPublicHttps(source.download_url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {Accept: '*/*', 'User-Agent': 'MineralX-Intelligence/1.0'},
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new OpsError('validation', 'The uploaded file used too many redirects.');
      url = await assertPublicHttps(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new OpsError('unavailable', 'An uploaded file could not be transferred to MineralX.');
    const announced = Number(response.headers.get('content-length') || 0);
    if (announced > MCP_FILE_LIMIT) throw new OpsError('validation', 'Each uploaded file must be 50 MiB or smaller.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MCP_FILE_LIMIT) {
        await reader.cancel();
        throw new OpsError('validation', 'Each uploaded file must be 50 MiB or smaller.');
      }
      chunks.push(value);
    }
    if (!size) throw new OpsError('validation', 'Empty files cannot be added to MineralX.');
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
  }
  throw new OpsError('unavailable', 'The uploaded file could not be transferred.');
}

function stableUuid(namespace: string, value: string) {
  const bytes = createHash('sha256').update(namespace).update('\0').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function completedStageReplay(
  principal: McpPrincipal,
  scope: Scope,
  id: string,
  family: McpSourceFamily,
  sourceReference: string,
): Promise<StagedMcpFile | null> {
  const {data, error} = await principal.db.rpc('mx_ops_files', {p_scope: scope.id, p_id: id});
  if (error) throw classifyDatabaseError(error);
  const record = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!record) return null;
  if (record.created_by !== principal.user.id || record.family !== family) {
    throw new OpsError('conflict', 'This source staging identity is already assigned to a different file. Use a new idempotency key.');
  }
  if (record.status !== 'verified') return null;
  if (typeof record.name !== 'string' || typeof record.media_type !== 'string'
    || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)
    || !Number.isSafeInteger(Number(record.size_bytes)) || Number(record.size_bytes) < 1
    || !['pending', 'clean'].includes(String(record.scan_status))) {
    throw new OpsError('unavailable', 'MineralX could not verify the previously staged source metadata.');
  }
  return {
    fileId: id,
    sourceReference,
  };
}

async function stageOne(
  principal: McpPrincipal,
  scope: Scope,
  source: OpenAiFile,
  family: McpSourceFamily,
  identity: {requestId: string},
): Promise<StagedMcpFile> {
  const stableIdentity = mcpFileStableIdentity(
    `${principal.authInfo.clientId}:${identity.requestId}`,
    source.file_id,
  );
  const id = stableUuid('mineralx-intelligence-file', stableIdentity);
  // A completed retry does not depend on the provider's short-lived download
  // URL still being usable. The stable, directly composable identity is returned.
  const replay = await completedStageReplay(principal, scope, id, family, source.file_id);
  if (replay) return replay;
  const bytes = await downloadBoundedFile(source);
  const {name, mediaType} = validatedMcpFileMetadata(bytes, source);
  const contentViolation = evidenceContentViolation(bytes, {name, mediaType});
  if (contentViolation) throw new OpsError('validation', contentViolation);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Stable IDs make an interrupted ChatGPT/MCP retry safe: the existing command
  // receipt and checksum prove whether the exact same source already arrived.
  // Existing command validation remains the only way to create a canonical file record.
  const storedMediaType = mediaType;
  const {data: prepared, error: prepareError} = await principal.db.rpc('mx_ops_command', {
    p_scope: scope.id,
    // One command receipt represents one logical stage request. Reusing its
    // idempotency key with a different provider file is therefore rejected.
    p_request: identity.requestId,
    p_action: 'file.prepare',
    p_id: id,
    p_expected: 0,
    p_payload: {family, name, media_type: storedMediaType, size_bytes: bytes.length, sha256},
  });
  if (prepareError) throw classifyDatabaseError(prepareError);
  const path = prepared?.record?.object_path as string | undefined;
  if (!path) throw new OpsError('unavailable', 'MineralX did not return a private storage path.');
  const service = trustedDatabase();
  const uploaded = await service.storage.from(EVIDENCE_BUCKET).upload(path, bytes, {contentType: storedMediaType, upsert: false});
  if (uploaded.error) {
    const existing = await service.storage.from(EVIDENCE_BUCKET).download(path);
    if (existing.error || !existing.data) throw new OpsError('unavailable', 'The private file upload could not be completed.');
    const existingBytes = Buffer.from(await existing.data.arrayBuffer());
    if (createHash('sha256').update(existingBytes).digest('hex') !== sha256) {
      throw new OpsError('conflict', 'The destination already contains different source bytes.');
    }
  }
  const finalized = await service.rpc('mx_ops_file_finalize', {
    p_actor: principal.user.id, p_scope: scope.id, p_id: id, p_hash: sha256, p_bytes: bytes.length,
  });
  if (finalized.error) throw classifyDatabaseError(finalized.error);
  return {
    fileId: id,
    sourceReference: source.file_id,
  };
}

export async function stageMcpSource(
  principal: McpPrincipal,
  scopeId: string,
  source: OpenAiFile,
  sourceFamily: McpSourceFamily,
  identity: {requestId: string},
) {
  const scope = principal.context.scopes.find((candidate) => candidate.id === scopeId);
  if (!scope || !scope.permissions.includes('work.write') || !canStageMcpSourceFamily(scope.permissions, sourceFamily)) {
    throw new OpsError('forbidden', 'This account cannot create that evidence-family intake in the selected workspace.');
  }
  return stageOne(principal, scope, source, sourceFamily, identity);
}

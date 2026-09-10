import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {getOAuthProtectedResourceMetadataUrl} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {
  GEOLOGY_RECORD_KINDS,
  MCP_DATABASE_ROLE,
  MCP_OAUTH_SCOPES,
  MCP_OAUTH_SECURITY_SCHEMES,
  STANDARD_RECORD_KINDS,
  canStageMcpSourceFamily,
  canonicalMcpResourceUrl,
  configuredMcpOAuthClientIds,
  hasIsolatedMcpTokenClaims,
  isExplicitMcpAccessDenied,
  isGeologyRecordKind,
  isNonPublicIpAddress,
  isRetryableIdentityStatus,
  mcpFileStableIdentity,
  mcpOpsContextSchema,
  mcpStagedSourceSchema,
  mcpStagedSourcesSchema,
  mcpSourceFamilySchema,
  missingMcpOAuthScopes,
  mineralXRecordKindSchema,
  oauthClientClaimRequired,
  oauthClientAllowlistConfigured,
  openAiFileSchema,
  parseMcpBearerToken,
  singleOpenAiFileArraySchema,
  uuidCursorBefore,
} from '../../lib/mcp/contracts';
import {
  MCP_REQUEST_LIMIT,
  boundedMcpRequest,
  configuredMcpOrigins,
  exactOriginValidationResponse,
  validatedMcpCorsOrigin,
} from '../../lib/mcp/http';
import {validatedMcpFileMetadata} from '../../lib/mcp/file-content';
import {evidenceContentViolation} from '../../lib/intelligence/evidence-validation';

test('ChatGPT file inputs keep the required interoperable shape and reject unsafe provider IDs', () => {
  const schema = z.toJSONSchema(openAiFileSchema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  assert.deepEqual(Object.keys(schema.properties || {}).sort(), [
    'download_url', 'file_id', 'file_name', 'mime_type',
  ]);
  assert.deepEqual([...(schema.required || [])].sort(), ['download_url', 'file_id']);

  const valid = {
    download_url: 'https://files.example.test/download?token=short-lived',
    file_id: 'file-abc_123.4:revision',
  };
  assert.equal(openAiFileSchema.safeParse(valid).success, true);
  assert.equal(openAiFileSchema.safeParse({...valid, download_url: 'http://files.example.test/file'}).success, false);
  assert.equal(openAiFileSchema.safeParse({...valid, file_id: 'file-abc\nforged'}).success, false);
  assert.equal(openAiFileSchema.safeParse({...valid, file_id: 'file id'}).success, false);
  assert.equal(openAiFileSchema.safeParse({...valid, file_id: 'https://files.example.test/file'}).success, false);
  assert.equal(openAiFileSchema.safeParse({...valid, familyHint: 'geo'}).success, false);
  assert.equal(singleOpenAiFileArraySchema.safeParse([valid]).success, true);
  assert.equal(singleOpenAiFileArraySchema.safeParse([]).success, false);
  assert.equal(singleOpenAiFileArraySchema.safeParse([valid, {...valid, file_id: 'file-second'}]).success, false);
});

test('the intake source family is one explicit permission boundary', () => {
  for (const family of ['geo', 'plant', 'gold', 'custody'] as const) {
    assert.equal(mcpSourceFamilySchema.safeParse(family).success, true);
  }
  assert.equal(mcpSourceFamilySchema.safeParse('automatic').success, false);
  assert.equal(canStageMcpSourceFamily(['work.write', 'files.geo'], 'geo'), true);
  assert.equal(canStageMcpSourceFamily(['work.write', 'files.geo'], 'gold'), false);
});

test('one-file staging identities are stable across retries and bound to the provider file', () => {
  const requestId = '6f69b6f4-e7e4-52ef-8761-b1345e524dca';
  assert.equal(mcpFileStableIdentity(requestId, 'file-first'), `${requestId}:file-first`);
  assert.equal(mcpFileStableIdentity(requestId, 'file-first'), mcpFileStableIdentity(requestId, 'file-first'));
  assert.notEqual(mcpFileStableIdentity(requestId, 'file-first'), mcpFileStableIdentity(requestId, 'file-second'));
  assert.notEqual(
    mcpFileStableIdentity(`client-a:${requestId}`, 'file-first'),
    mcpFileStableIdentity(`client-b:${requestId}`, 'file-first'),
  );

  const serverSource = readFileSync(new URL('../../lib/mcp/server.ts', import.meta.url), 'utf8');
  const transferSource = readFileSync(new URL('../../lib/mcp/file-transfer.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /const identity = `\$\{principal\.authInfo\.clientId\}:\$\{principal\.user\.id\}:\$\{scopeId\}:\$\{idempotencyKey\}`/);
  assert.match(serverSource, /mineralx-mcp-approve[^\n]+principal\.authInfo\.clientId/);
  assert.match(serverSource, /mineralx-mcp-complete[^\n]+principal\.authInfo\.clientId/);
  assert.match(transferSource, /`\$\{principal\.authInfo\.clientId\}:\$\{identity\.requestId\}`/);
});

test('intake creation accepts only bounded, unique staged source identities without download URLs', () => {
  const first = {fileId: '6f69b6f4-e7e4-52ef-8761-b1345e524dca', sourceReference: 'file-first'};
  assert.deepEqual(mcpStagedSourceSchema.parse(first), first);
  assert.equal(mcpStagedSourcesSchema.safeParse([first]).success, true);
  assert.equal(mcpStagedSourcesSchema.safeParse([]).success, false);
  assert.equal(mcpStagedSourcesSchema.safeParse(Array.from({length: 21}, (_, index) => ({
    fileId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  }))).success, false);
  assert.equal(mcpStagedSourcesSchema.safeParse([first, first]).success, false);
  assert.equal(mcpStagedSourcesSchema.safeParse([{...first, sourceReference: 'https://files.example.test/private'}]).success, false);
  assert.equal(mcpStagedSourcesSchema.safeParse([{...first, download_url: 'https://files.example.test/private'}]).success, false);
  assert.equal(mcpStagedSourcesSchema.safeParse([{...first, metadata: {sha256: 'untrusted'}}]).success, false);
});

test('MCP tool guidance exposes the durable stage, create and repeated-analysis flow', () => {
  const source = readFileSync(new URL('../../lib/mcp/server.ts', import.meta.url), 'utf8');
  assert.match(source, /place each returned object unchanged in create_mineralx_intake\.sources/);
  assert.match(source, /return a strict stable source identity that can be placed unchanged/);
  assert.match(source, /call analyze_mineralx_intake repeatedly while the intake remains received/);
  assert.match(source, /Advance exactly one durable processing phase/);
  assert.match(source, /does not malware-scan it or create an intake/);
});

test('missing optional ChatGPT filenames derive safe names from verified content', () => {
  const pdf = Buffer.from('%PDF-1.7\nminimal test body', 'ascii');
  const pdfMetadata = validatedMcpFileMetadata(pdf, {file_id: 'file-pdf'});
  assert.deepEqual(pdfMetadata, {name: 'chatgpt-file-pdf.pdf', mediaType: 'application/pdf'});
  assert.equal(evidenceContentViolation(pdf, pdfMetadata), undefined);

  const docx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml\0word/document.xml\0', 'ascii'),
  ]);
  const docxMetadata = validatedMcpFileMetadata(docx, {file_id: 'file-docx'});
  assert.deepEqual(docxMetadata, {name: 'chatgpt-file-docx.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  assert.equal(evidenceContentViolation(docx, docxMetadata), undefined);
});

test('browser origins require an exact configured scheme and port', () => {
  const allowed = configuredMcpOrigins('https://chatgpt.com,https://operator.example:8443');
  assert.deepEqual(allowed, ['https://chatgpt.com', 'https://operator.example:8443']);
  const accepted = new Request('https://mineral-x.com.au/api/mcp', {headers: {Origin: 'https://operator.example:8443'}});
  const wrongScheme = new Request('https://mineral-x.com.au/api/mcp', {headers: {Origin: 'http://operator.example:8443'}});
  const noOrigin = new Request('https://mineral-x.com.au/api/mcp');
  assert.equal(validatedMcpCorsOrigin(accepted, allowed), 'https://operator.example:8443');
  assert.equal(exactOriginValidationResponse(accepted, allowed), null);
  assert.equal(exactOriginValidationResponse(noOrigin, allowed), null);
  assert.equal(exactOriginValidationResponse(wrongScheme, allowed)?.status, 403);
  assert.equal(validatedMcpCorsOrigin(wrongScheme, allowed), null);
  assert.deepEqual(configuredMcpOrigins('http://chatgpt.com', 'production'), []);
});

test('the MCP request limit bounds streamed bodies without Content-Length', async () => {
  let emitted = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= 2) return controller.close();
      emitted += 1;
      controller.enqueue(new Uint8Array(Math.floor(MCP_REQUEST_LIMIT / 2) + 1));
    },
  });
  const request = new Request('https://mineral-x.com.au/api/mcp', {
    method: 'POST', body, duplex: 'half',
  } as RequestInit & {duplex: 'half'});
  const bounded = await boundedMcpRequest(request);
  assert.ok(bounded instanceof Response);
  assert.equal(bounded.status, 413);

  const valid = new Request('https://mineral-x.com.au/api/mcp', {method: 'POST', body: '{"jsonrpc":"2.0"}'});
  const rebuilt = await boundedMcpRequest(valid);
  assert.ok(rebuilt instanceof Request);
  assert.equal(await rebuilt.text(), '{"jsonrpc":"2.0"}');
});

test('every search geology family can be retrieved through the shared record contract', () => {
  for (const kind of ['samples', 'collars', 'dispatches', 'assayBatches'] as const) {
    assert.equal(isGeologyRecordKind(kind), true);
    assert.equal(mineralXRecordKindSchema.safeParse(kind).success, true);
  }
  assert.equal(new Set([...STANDARD_RECORD_KINDS, ...GEOLOGY_RECORD_KINDS]).size,
    STANDARD_RECORD_KINDS.length + GEOLOGY_RECORD_KINDS.length);
});

test('exact geology lookup derives the exclusive cursor immediately before a UUID', () => {
  assert.equal(uuidCursorBefore('10000000-0000-4000-8000-000000000001'), '10000000-0000-4000-8000-000000000000');
  assert.equal(uuidCursorBefore('10000000-0000-4000-8000-000000000000'), '10000000-0000-4000-7fff-ffffffffffff');
  assert.equal(uuidCursorBefore('00000000-0000-0000-0000-000000000000'), null);
  assert.throws(() => uuidCursorBefore('not-a-uuid'), /Invalid UUID/);
});

test('OAuth tool metadata is explicit and the development bypass cannot disable client identity in production', () => {
  assert.deepEqual(MCP_OAUTH_SECURITY_SCHEMES, [{type: 'oauth2', scopes: [...MCP_OAUTH_SCOPES]}]);
  assert.equal(oauthClientClaimRequired('production', 'off'), true);
  assert.equal(oauthClientClaimRequired('development', 'off'), false);
  assert.equal(oauthClientClaimRequired('development', undefined), true);
  assert.equal(parseMcpBearerToken('bearer abc.DEF_123-~+/='), 'abc.DEF_123-~+/=');
  assert.equal(parseMcpBearerToken('Basic abc'), null);
  assert.equal(parseMcpBearerToken('Bearer token with spaces'), null);
  assert.deepEqual(missingMcpOAuthScopes(['email', 'openid']), ['profile']);
  assert.deepEqual(missingMcpOAuthScopes(['profile', 'openid', 'email']), []);
  assert.deepEqual(configuredMcpOAuthClientIds(' client-a,client-b, client-a '), ['client-a', 'client-b']);
  assert.equal(oauthClientAllowlistConfigured('production', ''), false);
  assert.equal(oauthClientAllowlistConfigured('production', 'client-a'), true);
  assert.equal(isRetryableIdentityStatus(429), true);
  assert.equal(isRetryableIdentityStatus(503), true);
  assert.equal(isRetryableIdentityStatus(401), false);
  assert.equal(isExplicitMcpAccessDenied('ACCESS_DENIED: no membership'), true);
  assert.equal(isExplicitMcpAccessDenied('permission denied for function mx_ops_context'), false);
});

test('only hook-isolated OAuth claims may enter the MCP database gateway', () => {
  assert.equal(MCP_DATABASE_ROLE, 'mineralx_mcp');
  assert.equal(hasIsolatedMcpTokenClaims({role: 'mineralx_mcp', mineralx_token_class: 'mcp_oauth'}), true);
  assert.equal(hasIsolatedMcpTokenClaims({role: 'authenticated', mineralx_token_class: 'mcp_oauth'}), false);
  assert.equal(hasIsolatedMcpTokenClaims({role: 'mineralx_mcp'}), false);
  assert.equal(hasIsolatedMcpTokenClaims({role: 'MINERALX_MCP', mineralx_token_class: 'mcp_oauth'}), false);

  const authSource = readFileSync(new URL('../../lib/mcp/auth.ts', import.meta.url), 'utf8');
  assert.match(authSource, /claims\.sub !== user\.id/);
  assert.match(authSource, /hasIsolatedMcpTokenClaims\(claims\)/);
  assert.match(authSource, /service\.rpc\('mx_ops_mcp_gateway'/);
  assert.doesNotMatch(authSource, /await db\.rpc\('mx_ops_context'/);
});

test('the verified MineralX context is runtime validated before tools receive it', () => {
  const valid = {
    userId: 'b1f16904-c671-40c1-b91e-b40777e2ce53', schemaVersion: 10,
    scopes: [{
      id: '6ca15d1a-c7a9-4e8e-ab27-b726ee5d1514', org_id: '16846864-b081-40bb-9840-75917e901e15',
      name: 'Project A', code: 'PROJECT-A', kind: 'project', timezone: 'Australia/Brisbane',
      permissions: ['geo.read'], version: 1, policy: {},
    }],
    organisations: [{id: '16846864-b081-40bb-9840-75917e901e15', name: 'MineralX', admin: false}],
    aal: 'aal2', asOf: '2026-09-10T00:00:00Z',
  };
  assert.equal(mcpOpsContextSchema.safeParse(valid).success, true);
  assert.equal(mcpOpsContextSchema.safeParse({...valid, scopes: [{...valid.scopes[0], permissions: 'geo.read'}]}).success, false);
  assert.equal(mcpOpsContextSchema.safeParse({...valid, userId: 'not-a-user-id'}).success, false);
});

test('the canonical OAuth resource is stable behind allowed host aliases and mandatory in production', () => {
  const resource = canonicalMcpResourceUrl({
    requestUrl: 'https://www.mineral-x.com.au/api/mcp',
    publicOrigin: 'https://mineral-x.com.au',
    audience: 'https://mineral-x.com.au/api/mcp',
    nodeEnv: 'production',
  });
  assert.equal(resource.toString(), 'https://mineral-x.com.au/api/mcp');
  assert.equal(getOAuthProtectedResourceMetadataUrl(resource), 'https://mineral-x.com.au/.well-known/oauth-protected-resource/api/mcp');
  assert.throws(() => canonicalMcpResourceUrl({
    requestUrl: 'https://mineral-x.com.au/api/mcp',
    publicOrigin: 'https://mineral-x.com.au',
    nodeEnv: 'production',
  }), /origin and audience/);
  assert.throws(() => canonicalMcpResourceUrl({
    requestUrl: 'https://mineral-x.com.au/api/mcp',
    publicOrigin: 'https://mineral-x.com.au',
    audience: 'https://www.mineral-x.com.au/api/mcp',
    nodeEnv: 'production',
  }), /must equal/);
});

test('file transfer rejects private, reserved, documentation and transition addresses', () => {
  for (const address of [
    '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.2', '172.31.255.255',
    '192.0.0.9', '192.0.2.2', '192.88.99.1', '192.168.2.2', '198.18.0.1',
    '198.51.100.2', '203.0.113.7', '224.0.0.1', '::1', '::ffff:127.0.0.1',
    '64:ff9b::7f00:1', '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::',
    '3fff::1', '4000::1', '5f00::1', 'fc00::1', 'fe80::1', 'fec0::1', 'ff02::1',
  ]) assert.equal(isNonPublicIpAddress(address), true, address);

  for (const address of ['8.8.8.8', '93.184.216.34', '2001:4860:4860::8888', '2606:2800:220:1:248:1893:25c8:1946']) {
    assert.equal(isNonPublicIpAddress(address), false, address);
  }
});

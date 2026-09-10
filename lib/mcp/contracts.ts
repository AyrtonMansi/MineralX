import {z} from 'zod';

export const STANDARD_RECORD_KINDS = [
  'feed', 'campaigns', 'runs', 'lots', 'weights', 'assays', 'production', 'custody',
  'transfers', 'periods', 'balance_lines', 'work', 'settlements', 'allocations',
] as const;

export const GEOLOGY_RECORD_KINDS = [
  'samples', 'collars', 'intervals', 'programs', 'surveys', 'geology', 'targets',
  'dispatches', 'assayBatches', 'spatialLayers', 'observations', 'files',
] as const;

export const standardRecordKindSchema = z.enum(STANDARD_RECORD_KINDS);
export const geologyRecordKindSchema = z.enum(GEOLOGY_RECORD_KINDS);
export const mineralXRecordKindSchema = z.enum([...STANDARD_RECORD_KINDS, ...GEOLOGY_RECORD_KINDS]);

export type StandardRecordKind = z.infer<typeof standardRecordKindSchema>;
export type GeologyRecordKind = z.infer<typeof geologyRecordKindSchema>;
export const MCP_SOURCE_FAMILIES = ['geo', 'plant', 'gold', 'custody'] as const;
export const mcpSourceFamilySchema = z.enum(MCP_SOURCE_FAMILIES);
export type McpSourceFamily = z.infer<typeof mcpSourceFamilySchema>;

const providerFileIdSchema = z.string()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'The provider file ID contains unsupported characters.');

export const openAiFileSchema = z.object({
  download_url: z.string().url().max(4096).refine((value) => new URL(value).protocol === 'https:', 'File references must use HTTPS.'),
  file_id: providerFileIdSchema,
  mime_type: z.string().max(160).optional(),
  file_name: z.string().max(240).optional(),
}).strict();

export type OpenAiFile = z.infer<typeof openAiFileSchema>;

// ChatGPT supplies file parameters as an array. Staging exactly one source per
// call keeps network work bounded and gives every upload its own retry key.
export const singleOpenAiFileArraySchema = z.array(openAiFileSchema).length(1);

const mcpSourceReferenceSchema = z.string().trim().max(500).refine(
  (value) => !/(?:^[\s]*(?:(?:https?|ftp|file|data):|\/\/)|:\/\/)/i.test(value),
  'Store a source reference, not a download URL.',
);

export const mcpStagedSourceSchema = z.object({
  fileId: z.string().uuid(),
  sourceReference: mcpSourceReferenceSchema.optional(),
}).strict();
export type McpStagedSource = z.infer<typeof mcpStagedSourceSchema>;

export const mcpStagedSourcesSchema = z.array(mcpStagedSourceSchema).min(1).max(20).superRefine((sources, context) => {
  const fileIds = new Set<string>();
  sources.forEach((source, index) => {
    if (fileIds.has(source.fileId)) {
      context.addIssue({code: 'custom', path: [index, 'fileId'], message: 'Attach each staged source once.'});
    }
    fileIds.add(source.fileId);
  });
});

export const MCP_OAUTH_SCOPES = ['openid', 'profile', 'email'] as const;
export const MCP_OAUTH_SECURITY_SCHEMES = [{type: 'oauth2', scopes: [...MCP_OAUTH_SCOPES]}] as const;
export const MCP_DATABASE_ROLE = 'mineralx_mcp' as const;
export const MCP_TOKEN_CLASS = 'mcp_oauth' as const;

export function hasIsolatedMcpTokenClaims(input: {role?: unknown; mineralx_token_class?: unknown}) {
  return input.role === MCP_DATABASE_ROLE && input.mineralx_token_class === MCP_TOKEN_CLASS;
}

export const mcpOpsContextSchema = z.object({
  userId: z.string().uuid(),
  schemaVersion: z.number().int().nonnegative(),
  scopes: z.array(z.object({
    id: z.string().uuid(),
    org_id: z.string().uuid(),
    name: z.string().min(1).max(256),
    code: z.string().min(1).max(64),
    kind: z.enum(['project', 'facility', 'reporting']),
    timezone: z.string().min(1).max(128),
    permissions: z.array(z.string().min(1).max(128)).max(500),
    version: z.number().int().positive(),
    policy: z.record(z.string(), z.unknown()),
  }).passthrough()).max(1000),
  organisations: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(256),
    admin: z.boolean(),
  }).passthrough()).max(1000),
  aal: z.string().min(1).max(64),
  asOf: z.string().min(1).max(64),
}).passthrough();

export function oauthToolMeta(extra: Record<string, unknown> = {}) {
  return {securitySchemes: MCP_OAUTH_SECURITY_SCHEMES, ...extra};
}

export function missingMcpOAuthScopes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return MCP_OAUTH_SCOPES.filter((scope) => !granted.has(scope));
}

export function isGeologyRecordKind(kind: string): kind is GeologyRecordKind {
  return (GEOLOGY_RECORD_KINDS as readonly string[]).includes(kind);
}

/**
 * mx_ops_geo_page is cursor-based and excludes the cursor itself. PostgreSQL
 * orders UUIDs by their 16-byte value, so the immediate predecessor lets the
 * existing bounded RPC retrieve an exact geology record in one row.
 */
export function uuidCursorBefore(value: string) {
  const hex = value.replaceAll('-', '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(hex)) throw new Error('Invalid UUID cursor.');
  if (/^0+$/.test(hex)) return null;
  const digits = hex.split('');
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number.parseInt(digits[index], 16);
    if (digit > 0) {
      digits[index] = (digit - 1).toString(16);
      break;
    }
    digits[index] = 'f';
  }
  const previous = digits.join('');
  return `${previous.slice(0, 8)}-${previous.slice(8, 12)}-${previous.slice(12, 16)}-${previous.slice(16, 20)}-${previous.slice(20)}`;
}

export function oauthClientClaimRequired(nodeEnv: string | undefined, setting: string | undefined) {
  return nodeEnv === 'production' || setting !== 'off';
}

export function configuredMcpOAuthClientIds(value: string | undefined) {
  return [...new Set((value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export function oauthClientAllowlistConfigured(nodeEnv: string | undefined, value: string | undefined) {
  return nodeEnv !== 'production' || configuredMcpOAuthClientIds(value).length > 0;
}

export function isRetryableIdentityStatus(status: number | undefined) {
  return typeof status === 'number' && ([0, 408, 425, 429].includes(status) || status >= 500);
}

export function isExplicitMcpAccessDenied(message: string | undefined) {
  return /ACCESS_DENIED/i.test(message || '');
}

export function parseMcpBearerToken(header: string | null) {
  const match = /^Bearer +([A-Za-z0-9._~+\/-]+=*)$/i.exec(header || '');
  return match && match[1].length <= 8192 ? match[1] : null;
}

export function mcpFileStableIdentity(requestId: string, fileId: string) {
  return `${requestId}:${fileId}`;
}

export function canStageMcpSourceFamily(permissions: readonly string[], family: McpSourceFamily) {
  return permissions.includes(`files.${family}`);
}

export function canonicalMcpResourceUrl(input: {
  requestUrl: string;
  publicOrigin?: string;
  audience?: string;
  nodeEnv?: string;
}) {
  if (input.nodeEnv === 'production' && (!input.publicOrigin || !input.audience)) {
    throw new Error('Production MCP origin and audience are required.');
  }
  const expected = new URL('/api/mcp', input.publicOrigin || input.requestUrl);
  const resource = input.audience ? new URL(input.audience) : expected;
  if (resource.toString() !== expected.toString() || resource.username || resource.password || resource.search || resource.hash) {
    throw new Error('The MCP audience must equal the canonical /api/mcp resource URL.');
  }
  if (input.nodeEnv === 'production' && resource.protocol !== 'https:') {
    throw new Error('The production MCP resource must use HTTPS.');
  }
  return resource;
}

function ipv4Octets(value: string) {
  const values = value.split('.');
  if (values.length !== 4 || values.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = values.map(Number);
  return octets.some((part) => part < 0 || part > 255) ? null : octets;
}

function ipv6Hextets(value: string) {
  let address = value.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%', 1)[0];
  const dotted = address.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dotted) {
    const octets = ipv4Octets(dotted);
    if (!octets) return null;
    address = `${address.slice(0, -dotted.length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  if ((address.match(/::/g) || []).length > 1) return null;
  const [leftText, rightText] = address.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (!address.includes('::') && missing !== 0)) return null;
  const parts = [...left, ...Array.from({length: missing}, () => '0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[a-f0-9]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

/** True for private, local, reserved, documentation and transition IP space. */
export function isNonPublicIpAddress(value: string) {
  const normalized = value.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  const ipv4 = ipv4Octets(normalized.replace(/^::ffff:/, ''));
  if (ipv4) {
    const [a, b, c] = ipv4;
    return a === 0 || a === 10 || a === 127
      || a === 100 && b >= 64 && b <= 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 0 && (c === 0 || c === 2)
      || a === 192 && b === 88 && c === 99
      || a === 192 && b === 168
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
      || a === 203 && b === 0 && c === 113
      || a >= 224;
  }
  const ipv6 = ipv6Hextets(normalized);
  if (!ipv6) return false;
  const [a, b, c, d, e, f] = ipv6;
  return (a & 0xe000) !== 0x2000
    || a === 0 && b === 0 && c === 0 && d === 0 && e === 0
    || a === 0x64 && b === 0xff9b && (c === 0x1 || c === 0 && d === 0 && e === 0 && f === 0)
    || a === 0x100 && b === 0 && c === 0 && d === 0
    || a === 0x2001 && (b & 0xfe00) === 0
    || a === 0x2001 && b === 0x0db8
    || a === 0x2002
    || a === 0x3fff && b < 0x1000
    || (a & 0xfe00) === 0xfc00
    || (a & 0xffc0) === 0xfe80
    || (a & 0xffc0) === 0xfec0
    || (a & 0xff00) === 0xff00;
}

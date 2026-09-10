import 'server-only';

import {createClient, type User} from '@supabase/supabase-js';
import {getOAuthProtectedResourceMetadataUrl, type AuthInfo} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {OPS_SCHEMA, type OpsContext} from '@/lib/ops/contracts';
import {trustedDatabase, type OperationsRpcClient} from '@/lib/ops/server';
import {
  MCP_OAUTH_SCOPES,
  canonicalMcpResourceUrl,
  configuredMcpOAuthClientIds,
  hasIsolatedMcpTokenClaims,
  isExplicitMcpAccessDenied,
  isRetryableIdentityStatus,
  mcpOpsContextSchema,
  missingMcpOAuthScopes,
  oauthClientAllowlistConfigured,
  oauthClientClaimRequired,
  parseMcpBearerToken,
} from './contracts';

export class McpAuthenticationError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    message: string,
    public readonly code: 'invalid_token' | 'insufficient_scope' | 'access_denied' | 'unavailable' = 'invalid_token',
  ) {
    super(message);
    this.name = 'McpAuthenticationError';
  }
}

export type McpPrincipal = {
  db: OperationsRpcClient;
  user: User;
  context: OpsContext;
  authInfo: AuthInfo;
};

type JwtClaims = {
  aud?: string | string[];
  client_id?: string;
  role?: string;
  mineralx_token_class?: string;
  sub?: string;
  session_id?: string;
  aal?: 'aal1' | 'aal2';
  exp?: number;
  nbf?: number;
  scope?: string;
  scopes?: string[];
};

const jwtClaimsSchema = z.object({
  aud: z.union([z.string().min(1).max(2048), z.array(z.string().min(1).max(2048)).max(20)]).optional(),
  client_id: z.string().min(1).max(512).optional(),
  role: z.string().min(1).max(128).optional(),
  mineralx_token_class: z.string().min(1).max(128).optional(),
  sub: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  aal: z.enum(['aal1', 'aal2']).optional(),
  exp: z.number().int().positive().optional(),
  nbf: z.number().int().nonnegative().optional(),
  scope: z.string().max(4096).optional(),
  scopes: z.array(z.string().min(1).max(256)).max(100).optional(),
}).passthrough();

function configuredIdentity() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new McpAuthenticationError(503, 'MineralX identity is not configured.', 'unavailable');
  return {url, key};
}

function bearerToken(request: Request) {
  const token = parseMcpBearerToken(request.headers.get('authorization'));
  if (!token) throw new McpAuthenticationError(401, 'A valid OAuth bearer token is required.');
  return token;
}

function claimsFromVerifiedToken(token: string): JwtClaims {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) throw new Error('missing payload');
    return jwtClaimsSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))) as JwtClaims;
  } catch {
    throw new McpAuthenticationError(401, 'The OAuth token could not be decoded.');
  }
}

function tokenScopes(claims: JwtClaims) {
  if (Array.isArray(claims.scopes)) return claims.scopes.filter((scope): scope is string => typeof scope === 'string');
  return typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean) : [];
}

function validateClientAndAudience(claims: JwtClaims, requiredAudience?: string) {
  const allowed = configuredMcpOAuthClientIds(process.env.MINERALX_MCP_ALLOWED_CLIENT_IDS);
  if (!oauthClientAllowlistConfigured(process.env.NODE_ENV, process.env.MINERALX_MCP_ALLOWED_CLIENT_IDS)) {
    throw new McpAuthenticationError(503, 'MineralX OAuth clients are not configured.', 'unavailable');
  }
  const clientId = claims.client_id;
  if (!clientId) {
    throw new McpAuthenticationError(401, 'Connect through the MineralX OAuth authorization flow.');
  }
  if (allowed.length && !allowed.includes(clientId)) {
    throw new McpAuthenticationError(403, 'This OAuth client is not approved for MineralX.', 'access_denied');
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (requiredAudience && !audiences.includes(requiredAudience)) {
    throw new McpAuthenticationError(401, 'The token was not issued for the MineralX MCP resource.');
  }
  return clientId;
}

function mcpGatewayDatabase(actorId: string, clientId: string, aal: 'aal1' | 'aal2'): OperationsRpcClient {
  const service = trustedDatabase();
  return {
    rpc(name, args = {}) {
      return service.rpc('mx_ops_mcp_gateway', {
        p_actor: actorId,
        p_client: clientId,
        p_aal: aal,
        p_operation: name,
        p_args: args,
      });
    },
  };
}

export async function authenticateMcpRequest(request: Request): Promise<McpPrincipal> {
  const token = bearerToken(request);
  const {url, key} = configuredIdentity();
  const db = createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {headers: {Authorization: `Bearer ${token}`}},
  });
  const {data: {user}, error: userError} = await db.auth.getUser(token);
  if (userError && isRetryableIdentityStatus(userError.status)) {
    throw new McpAuthenticationError(503, 'MineralX identity verification is temporarily unavailable.', 'unavailable');
  }
  if (userError || !user) throw new McpAuthenticationError(401, 'The OAuth token is invalid or expired.');

  // Claims are consumed only after getUser has verified the token with Supabase Auth.
  const claims = claimsFromVerifiedToken(token);
  if (claims.sub !== user.id || !claims.session_id) {
    throw new McpAuthenticationError(401, 'The OAuth token is not bound to the verified MineralX session.');
  }
  if (!hasIsolatedMcpTokenClaims(claims) || !claims.aal) {
    throw new McpAuthenticationError(503, 'MineralX OAuth database isolation is not configured.', 'unavailable');
  }
  const resource = canonicalMcpResourceUrl({
    requestUrl: request.url,
    publicOrigin: process.env.MINERALX_PUBLIC_ORIGIN,
    audience: process.env.MINERALX_MCP_AUDIENCE,
    nodeEnv: process.env.NODE_ENV,
  });
  const clientId = validateClientAndAudience(claims, process.env.MINERALX_MCP_AUDIENCE ? resource.toString() : undefined);
  const scopes = tokenScopes(claims);
  if (oauthClientClaimRequired(process.env.NODE_ENV, process.env.MINERALX_MCP_REQUIRE_OAUTH_CLIENT)
    && missingMcpOAuthScopes(scopes).length) {
    throw new McpAuthenticationError(403, 'The OAuth grant is missing required MineralX identity scopes.', 'insufficient_scope');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) {
    throw new McpAuthenticationError(401, 'The OAuth token has expired.');
  }
  if (claims.nbf && claims.nbf > now + 30) throw new McpAuthenticationError(401, 'The OAuth token is not active yet.');

  const gateway = mcpGatewayDatabase(user.id, clientId, claims.aal);
  const {data, error} = await gateway.rpc('mx_ops_context');
  if (error) {
    const denied = isExplicitMcpAccessDenied(error.message);
    throw new McpAuthenticationError(denied ? 403 : 503, denied
      ? 'This account is not assigned to MineralX Operations.'
      : 'MineralX authorization is temporarily unavailable.', denied ? 'access_denied' : 'unavailable');
  }
  const parsedContext = mcpOpsContextSchema.safeParse(data);
  if (!parsedContext.success) {
    throw new McpAuthenticationError(503, 'MineralX authorization returned an invalid context.', 'unavailable');
  }
  const context = parsedContext.data as OpsContext;
  if (context.userId !== user.id) {
    throw new McpAuthenticationError(403, 'This account is not assigned to MineralX Operations.', 'access_denied');
  }
  if (context.schemaVersion < OPS_SCHEMA) {
    throw new McpAuthenticationError(503, 'The MineralX Operations schema is awaiting migration.', 'unavailable');
  }

  return {
    db: gateway,
    user,
    context,
    authInfo: {
      token,
      clientId,
      scopes,
      expiresAt: claims.exp,
      resource,
      extra: {userId: user.id},
    },
  };
}

export function protectedResourceMetadataUrl(request: Request) {
  const resource = canonicalMcpResourceUrl({
    requestUrl: request.url,
    publicOrigin: process.env.MINERALX_PUBLIC_ORIGIN,
    audience: process.env.MINERALX_MCP_AUDIENCE,
    nodeEnv: process.env.NODE_ENV,
  });
  return getOAuthProtectedResourceMetadataUrl(resource);
}

function authenticationParameter(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/(["\\])/g, '\\$1');
}

export function mcpAuthenticationResponse(request: Request, error: unknown) {
  let known = error instanceof McpAuthenticationError
    ? error
    : new McpAuthenticationError(503, 'MineralX authentication is temporarily unavailable.', 'unavailable');
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  };
  if (known.status === 401 || known.code === 'insufficient_scope') {
    try {
      const requiredScope = known.code === 'insufficient_scope'
        ? `, scope="${authenticationParameter(MCP_OAUTH_SCOPES.join(' '))}"`
        : '';
      headers['WWW-Authenticate'] = `Bearer resource_metadata="${authenticationParameter(protectedResourceMetadataUrl(request))}", error="${known.code}", error_description="${authenticationParameter(known.message)}"${requiredScope}`;
    } catch {
      // A 401 must carry a valid RFC 6750 challenge. If canonical discovery is
      // misconfigured, report service unavailability instead of emitting a
      // challenge that is absent or points at an untrusted resource.
      console.warn(JSON.stringify({event: 'mcp_resource_metadata_unavailable'}));
      known = new McpAuthenticationError(503, 'MineralX authentication discovery is unavailable.', 'unavailable');
    }
  }
  return new Response(JSON.stringify({error: known.code, error_description: known.message}), {status: known.status, headers});
}

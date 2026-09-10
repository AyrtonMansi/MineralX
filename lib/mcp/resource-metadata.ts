import 'server-only';

import {canonicalMcpResourceUrl, MCP_OAUTH_SCOPES} from './contracts';

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function protectedResourceMetadataResponse(request: Request) {
  const configuredOrigin = process.env.MINERALX_PUBLIC_ORIGIN;
  if (!configuredOrigin && process.env.NODE_ENV === 'production') {
    return json({error: 'resource_origin_unavailable'}, 503);
  }
  let origin: URL;
  let authorizationServer: URL;
  let resource: URL;
  try {
    origin = new URL(configuredOrigin || request.url);
    authorizationServer = new URL(`${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/auth/v1`);
    resource = canonicalMcpResourceUrl({
      requestUrl: request.url,
      publicOrigin: configuredOrigin,
      audience: process.env.MINERALX_MCP_AUDIENCE,
      nodeEnv: process.env.NODE_ENV,
    });
  } catch {
    return json({error: 'identity_unavailable'}, 503);
  }
  if (process.env.NODE_ENV === 'production' && (origin.protocol !== 'https:' || authorizationServer.protocol !== 'https:')) {
    return json({error: 'identity_unavailable'}, 503);
  }
  return json({
    resource: resource.toString(),
    authorization_servers: [authorizationServer.toString().replace(/\/$/, '')],
    bearer_methods_supported: ['header'],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    resource_name: 'MineralX Intelligence',
    resource_documentation: new URL('/ops/intelligence', origin).toString(),
  });
}

export function protectedResourceMetadataOptions(request: Request) {
  const requestedHeaders = request.headers.get('access-control-request-headers');
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Cache-Control': 'public, max-age=300',
  });
  if (requestedHeaders) {
    headers.set('Access-Control-Allow-Headers', requestedHeaders);
    headers.set('Vary', 'Access-Control-Request-Headers');
  }
  return new Response(null, {status: 204, headers});
}

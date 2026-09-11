import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import {authenticateMcpRequest, mcpAuthenticationResponse, type McpPrincipal} from '@/lib/mcp/auth';
import {
  boundedMcpRequest,
  configuredMcpOrigins,
  exactOriginValidationResponse,
  validatedMcpCorsOrigin,
} from '@/lib/mcp/http';
import {createMineralXMcpServer} from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const handler = createMcpHandler((context) => {
  const principal = context.authInfo?.extra?.principal as McpPrincipal | undefined;
  if (!principal) throw new Error('Validated MineralX principal missing from MCP request.');
  return createMineralXMcpServer(principal);
}, {
  legacy: 'stateless',
  responseMode: 'json',
  onerror: () => {
    // Tool payloads and tokens are deliberately excluded from server logs.
    console.warn(JSON.stringify({event: 'mcp_request_failed'}));
  },
});

function allowedHostnames(request: Request) {
  const configured = (process.env.MINERALX_MCP_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return configured;
  if (process.env.NODE_ENV !== 'production') return ['localhost', '127.0.0.1', '[::1]'];
  const publicOrigin = process.env.MINERALX_PUBLIC_ORIGIN;
  return publicOrigin ? [new URL(publicOrigin).hostname] : ['mineral-x.com.au', 'www.mineral-x.com.au'];
}

function allowedOriginHostnames(request: Request) {
  const configured = configuredMcpOrigins(process.env.MINERALX_MCP_ALLOWED_ORIGINS, process.env.NODE_ENV)
    .map((value) => new URL(value).hostname);
  return configured.length ? configured : allowedHostnames(request);
}

function corsResponse(request: Request, response: Response) {
  const origin = validatedMcpCorsOrigin(request, configuredMcpOrigins(process.env.MINERALX_MCP_ALLOWED_ORIGINS, process.env.NODE_ENV));
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version, mcp-method, mcp-name, www-authenticate');
  headers.append('Vary', 'Origin');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

async function serve(request: Request) {
  const hostRejected = hostHeaderValidationResponse(request, allowedHostnames(request));
  if (hostRejected) return hostRejected;
  const originRejected = originValidationResponse(request, allowedOriginHostnames(request));
  if (originRejected) return originRejected;
  const exactOriginRejected = exactOriginValidationResponse(request, configuredMcpOrigins(process.env.MINERALX_MCP_ALLOWED_ORIGINS, process.env.NODE_ENV));
  if (exactOriginRejected) return exactOriginRejected;
  const bounded = await boundedMcpRequest(request);
  if (bounded instanceof Response) return corsResponse(request, bounded);
  let principal: McpPrincipal;
  try {
    principal = await authenticateMcpRequest(bounded);
  } catch (error) {
    return corsResponse(request, mcpAuthenticationResponse(bounded, error));
  }
  try {
    return corsResponse(request, await handler.fetch(bounded, {
      authInfo: {...principal.authInfo, extra: {...principal.authInfo.extra, principal}},
    }));
  } catch {
    console.warn(JSON.stringify({event: 'mcp_transport_failed'}));
    return corsResponse(request, new Response(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32603, message: 'Internal error'}}), {
      status: 500,
      headers: {'Cache-Control': 'private, no-store, max-age=0', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff'},
    }));
  }
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;

export async function OPTIONS(request: Request) {
  const hostRejected = hostHeaderValidationResponse(request, allowedHostnames(request));
  if (hostRejected) return hostRejected;
  const origin = request.headers.get('origin');
  const originRejected = originValidationResponse(request, allowedOriginHostnames(request));
  if (originRejected) return originRejected;
  const allowedOrigins = configuredMcpOrigins(process.env.MINERALX_MCP_ALLOWED_ORIGINS, process.env.NODE_ENV);
  const exactOriginRejected = exactOriginValidationResponse(request, allowedOrigins);
  if (exactOriginRejected) return exactOriginRejected;
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Origin',
  });
  const corsOrigin = validatedMcpCorsOrigin(request, allowedOrigins);
  if (origin && corsOrigin) headers.set('Access-Control-Allow-Origin', corsOrigin);
  return new Response(null, {
    status: 204,
    headers,
  });
}

export const MCP_REQUEST_LIMIT = 1_572_864; // 1.5 MiB

export function configuredMcpOrigins(value: string | undefined, nodeEnv?: string) {
  const origins: string[] = [];
  for (const entry of (value || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(entry);
      if (!['http:', 'https:'].includes(url.protocol) || nodeEnv === 'production' && url.protocol !== 'https:'
        || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) continue;
      origins.push(url.origin);
    } catch {
      // Invalid entries grant no access. Production remains unavailable to
      // browser clients until at least one exact origin is configured.
    }
  }
  return [...new Set(origins)];
}

export function validatedMcpCorsOrigin(request: Request, allowedOrigins: readonly string[]) {
  const value = request.headers.get('origin');
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return allowedOrigins.includes(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

export function exactOriginValidationResponse(request: Request, allowedOrigins: readonly string[]) {
  if (!request.headers.has('origin') || validatedMcpCorsOrigin(request, allowedOrigins)) return null;
  return new Response('Invalid Origin header', {
    status: 403,
    headers: {'Cache-Control': 'private, no-store, max-age=0', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'},
  });
}

export async function boundedMcpRequest(request: Request): Promise<Request | Response> {
  if (request.method !== 'POST' || !request.body) return request;
  const announced = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(announced) && announced > MCP_REQUEST_LIMIT) {
    return new Response('MCP request is too large. Pass files by reference.', {
      status: 413,
      headers: {'Cache-Control': 'private, no-store, max-age=0', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'},
    });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MCP_REQUEST_LIMIT) {
      await reader.cancel().catch(() => undefined);
      return new Response('MCP request is too large. Pass files by reference.', {
        status: 413,
        headers: {'Cache-Control': 'private, no-store, max-age=0', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'},
      });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {method: request.method, headers: request.headers, body, signal: request.signal});
}

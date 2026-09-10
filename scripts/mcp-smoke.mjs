#!/usr/bin/env node

/**
 * MineralX MCP smoke test.
 *
 * This deliberately needs no OAuth token or service-role secret. It exercises
 * the real MineralX tool registration over the SDK's in-memory transport, then
 * verifies the fail-closed OAuth challenge and discovery document exposed by a
 * running local Next.js app.
 *
 * Usage:
 *   node --import tsx scripts/mcp-smoke.mjs [https://localhost:3000]
 *
 * Both loopback HTTP and HTTPS are supported. Self-signed certificates are
 * accepted only for an individually validated loopback HTTPS request; TLS
 * verification is never disabled process-wide.
 */

import assert from 'node:assert/strict';
import https from 'node:https';
import {registerHooks} from 'node:module';

const EXPECTED_TOOLS = [
  'mineralx_context',
  'search_mineralx',
  'get_mineralx_record',
  'list_mineralx_records',
  'list_mineralx_intakes',
  'get_mineralx_intake',
  'stage_mineralx_source',
  'create_mineralx_intake',
  'analyze_mineralx_intake',
  'approve_mineralx_intake',
  'apply_mineralx_intake',
];

const REQUIRED_SCOPES = ['openid', 'profile', 'email'];
const REQUEST_TIMEOUT_MS = 8_000;
const RESPONSE_LIMIT_BYTES = 1_048_576;

function isLoopbackHostname(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function assertLocalTransportUrl(url, label = 'smoke-test URL') {
  assert.ok(
    ['http:', 'https:'].includes(url.protocol),
    `The ${label} must use local HTTP or HTTPS.`,
  );
  assert.ok(isLoopbackHostname(url.hostname), `The ${label} must use a loopback host.`);
  assert.equal(url.username, '', `The ${label} must not contain credentials.`);
  assert.equal(url.password, '', `The ${label} must not contain credentials.`);
}

function localBaseUrl(value) {
  const url = new URL(value || 'https://localhost:3000');
  assertLocalTransportUrl(url);
  assert.equal(url.search, '', 'The smoke-test URL must not contain a query string.');
  assert.equal(url.hash, '', 'The smoke-test URL must not contain a fragment.');
  url.pathname = url.pathname.replace(/\/$/, '');
  return url;
}

function rpcClient(transport) {
  let nextId = 1;
  const pending = new Map();

  transport.onmessage = (message) => {
    if (!('id' in message)) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  };

  return {
    async request(method, params = {}) {
      const id = nextId++;
      const response = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}.`));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, {resolve, timeout});
      });
      await transport.send({jsonrpc: '2.0', id, method, params});
      const message = await response;
      if ('error' in message) {
        throw new Error(`${method} failed: ${message.error.code} ${message.error.message}`);
      }
      return message.result;
    },
    notify(method, params) {
      return transport.send(params === undefined
        ? {jsonrpc: '2.0', method}
        : {jsonrpc: '2.0', method, params});
    },
  };
}

async function verifyRegisteredProtocol(endpoint) {
  // Next.js normally supplies the server-only sentinel. The hook is scoped to
  // this process so the production module can be loaded by the Node smoke test;
  // it cannot affect the running app or weaken its runtime boundary.
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'server-only') {
        return {url: 'data:text/javascript,export default undefined', shortCircuit: true};
      }
      return nextResolve(specifier, context);
    },
  });

  const [{InMemoryTransport, LATEST_PROTOCOL_VERSION}, {createMineralXMcpServer}] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('../lib/mcp/server.ts'),
  ]);

  const userId = '00000000-0000-4000-8000-000000000001';
  const principal = {
    db: {rpc: async () => { throw new Error('The registration smoke test must not access the database.'); }},
    user: {id: userId},
    context: {
      userId,
      schemaVersion: Number.MAX_SAFE_INTEGER,
      scopes: [],
      organisations: [],
      aal: 'aal2',
      asOf: new Date(0).toISOString(),
    },
    authInfo: {
      token: 'in-process-smoke-token',
      clientId: 'in-process-smoke-client',
      scopes: REQUIRED_SCOPES,
      expiresAt: 4_102_444_800,
      resource: endpoint,
    },
  };

  const server = createMineralXMcpServer(principal);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = rpcClient(clientTransport);

  try {
    await clientTransport.start();
    await server.connect(serverTransport);
    const initialized = await client.request('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {name: 'mineralx-local-smoke', version: '1.0.0'},
    });
    assert.equal(initialized.serverInfo?.name, 'mineralx-intelligence');
    assert.equal(initialized.serverInfo?.version, '1.0.0');
    assert.ok(initialized.capabilities?.tools, 'The MCP initialize response must advertise tool support.');

    await client.notify('notifications/initialized');
    const listed = await client.request('tools/list');
    assert.ok(Array.isArray(listed.tools), 'tools/list must return a tools array.');
    assert.deepEqual(listed.tools.map((tool) => tool.name), EXPECTED_TOOLS);
    for (const tool of listed.tools) {
      assert.equal(tool.inputSchema?.type, 'object', `${tool.name} must publish an object input schema.`);
      assert.deepEqual(
        tool._meta?.securitySchemes,
        [{type: 'oauth2', scopes: REQUIRED_SCOPES}],
        `${tool.name} must publish the MineralX OAuth security scheme.`,
      );
    }
  } finally {
    await server.close().catch(() => undefined);
  }
}

function challengeParameter(challenge, name) {
  const match = new RegExp(`(?:^|,\\s*)${name}="((?:[^"\\\\]|\\\\.)*)"`).exec(challenge);
  return match?.[1]?.replace(/\\(["\\])/g, '$1');
}

function selfSignedLoopbackRequest(url, init) {
  return new Promise((resolve, reject) => {
    const headers = new Headers();
    const request = https.request(url, {
      method: init?.method || 'GET',
      headers: init?.headers,
      // Safe only because request() validates this exact URL as loopback before
      // selecting this transport. Never move this to NODE_TLS_REJECT_UNAUTHORIZED.
      rejectUnauthorized: false,
    }, (response) => {
      for (const [name, value] of Object.entries(response.headers)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
          headers.append(name, String(item));
        }
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > RESPONSE_LIMIT_BYTES) {
          response.destroy(new Error('The local smoke-test response exceeded 1 MiB.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode || 500,
          statusText: response.statusMessage,
          headers,
        }));
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('The local HTTPS request timed out.')));
    request.on('error', reject);
    request.end(init?.body);
  });
}

async function request(input, init) {
  const url = input instanceof URL ? input : new URL(input);
  assertLocalTransportUrl(url, 'request URL');
  try {
    if (url.protocol === 'https:') return await selfSignedLoopbackRequest(url, init);
    return await fetch(url, {...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
  } catch (error) {
    throw new Error(`Could not reach the local MineralX app at ${url.origin}. Start its local server, then retry.`, {cause: error});
  }
}

async function verifyLiveAuthentication(endpoint) {
  const response = await request(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {name: 'mineralx-unauthenticated-smoke', version: '1.0.0'},
      },
    }),
    redirect: 'error',
  });

  assert.equal(response.status, 401, 'An unauthenticated MCP initialize request must be rejected with 401.');
  assert.match(response.headers.get('cache-control') || '', /no-store/i);
  const challenge = response.headers.get('www-authenticate') || '';
  assert.match(challenge, /^Bearer\s/i, 'The 401 response must include a Bearer challenge.');
  const challengeParameters = challenge.replace(/^Bearer\s+/i, '');
  assert.equal(challengeParameter(challengeParameters, 'error'), 'invalid_token');
  const discoveryValue = challengeParameter(challengeParameters, 'resource_metadata');
  assert.ok(discoveryValue, 'The Bearer challenge must include resource_metadata.');

  const body = await response.json();
  assert.equal(body.error, 'invalid_token');
  assert.ok(!JSON.stringify(body).toLowerCase().includes('supabase_service_role'), 'The response must not expose server credentials.');

  const discoveryUrl = new URL(discoveryValue);
  assertLocalTransportUrl(discoveryUrl, 'OAuth discovery URL');
  assert.equal(discoveryUrl.protocol, endpoint.protocol, 'OAuth discovery must use the local MineralX protocol.');
  assert.equal(discoveryUrl.port, endpoint.port, 'OAuth discovery must remain on the local MineralX port.');
  assert.equal(discoveryUrl.pathname, '/.well-known/oauth-protected-resource/api/mcp');

  const discovery = await request(discoveryUrl, {headers: {Accept: 'application/json'}, redirect: 'error'});
  assert.equal(
    discovery.status,
    200,
    `OAuth discovery returned ${discovery.status}. Configure NEXT_PUBLIC_SUPABASE_URL on the running app; it is a public project URL, not a secret.`,
  );
  assert.equal(discovery.headers.get('access-control-allow-origin'), '*');
  const metadata = await discovery.json();
  assert.equal(metadata.resource, new URL('/api/mcp', discoveryUrl).toString());
  assert.deepEqual(metadata.scopes_supported, REQUIRED_SCOPES);
  assert.equal(metadata.bearer_methods_supported?.[0], 'header');
  assert.ok(Array.isArray(metadata.authorization_servers) && metadata.authorization_servers.length === 1);
  const authorizationServer = new URL(metadata.authorization_servers[0]);
  assert.equal(authorizationServer.pathname.replace(/\/$/, ''), '/auth/v1');
}

const base = localBaseUrl(process.argv[2]);
const endpoint = new URL('/api/mcp', base);

await verifyRegisteredProtocol(endpoint);
console.log(`PASS  MCP initialize + ${EXPECTED_TOOLS.length} registered tools (in-process, no database or secrets)`);

await verifyLiveAuthentication(endpoint);
console.log(`PASS  unauthenticated OAuth challenge + protected-resource discovery (${endpoint.origin})`);
console.log('MineralX MCP smoke test passed.');

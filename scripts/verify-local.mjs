#!/usr/bin/env node

/** Verify the live, local-only MineralX dependencies without exposing secrets. */

import assert from 'node:assert/strict';
import {X509Certificate} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const certificatePath = fileURLToPath(new URL('../certificates/localhost.pem', import.meta.url));
const certificateKeyPath = fileURLToPath(new URL('../certificates/localhost-key.pem', import.meta.url));
const signingKeyPath = fileURLToPath(new URL('../supabase/signing_key.json', import.meta.url));
const facilityId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';

function envFile() {
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
  }
  return values;
}

function loopbackUrl(value, protocols) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  assert.ok(protocols.includes(url.protocol));
  return url;
}

function localHttps(url, init = {}) {
  const target = loopbackUrl(url, ['https:']);
  return new Promise((resolve, reject) => {
    const request = httpsRequest(target, {
      method: init.method || 'GET',
      headers: init.headers,
      rejectUnauthorized: false,
      timeout: 8_000,
    }, (response) => {
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) request.destroy(new Error('Local response exceeded 2 MiB.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => request.destroy(new Error('Local HTTPS request timed out.')));
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

async function main() {
  const values = envFile();
  assert.equal(statSync(envPath).mode & 0o777, 0o600, '.env.local must be owner-readable only.');
  assert.equal(statSync(certificateKeyPath).mode & 0o777, 0o600, 'The local HTTPS private key must be owner-readable only.');
  assert.equal(statSync(signingKeyPath).mode & 0o777, 0o600, 'The local OAuth signing key must be owner-readable only.');
  const signingKeys = JSON.parse(readFileSync(signingKeyPath, 'utf8'));
  assert.ok(Array.isArray(signingKeys) && signingKeys.length === 1
    && signingKeys[0].kty === 'EC' && signingKeys[0].crv === 'P-256'
    && signingKeys[0].alg === 'ES256' && signingKeys[0].d,
  'The local OAuth signing material must contain one private ES256 key.');
  const certificate = new X509Certificate(readFileSync(certificatePath));
  assert.ok(Date.parse(certificate.validTo) > Date.now() + 24 * 60 * 60 * 1000,
    'The local HTTPS certificate is expired or about to expire; rerun npm run local:setup.');
  const apiUrl = loopbackUrl(values.NEXT_PUBLIC_SUPABASE_URL, ['http:', 'https:']).toString().replace(/\/$/, '');
  const publishable = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = values.SUPABASE_SERVICE_ROLE_KEY;
  const email = values.MINERALX_LOCAL_TEST_EMAIL;
  const password = values.MINERALX_LOCAL_TEST_PASSWORD;
  assert.ok(publishable && secret && email && password, 'Run npm run local:setup first.');

  const userClient = createClient(apiUrl, publishable, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  const signedIn = await userClient.auth.signInWithPassword({email, password});
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.user && signedIn.data.session);
  const claims = JSON.parse(Buffer.from(signedIn.data.session.access_token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.role, 'authenticated');
  assert.equal(claims.client_id, undefined, 'A browser login must not be elevated into an MCP OAuth role.');

  const context = await userClient.rpc('mx_ops_context');
  assert.ifError(context.error);
  assert.equal(context.data.userId, signedIn.data.user.id);
  assert.deepEqual(new Set(context.data.scopes.map((scope) => scope.id)), new Set([facilityId, projectId]));
  for (const scope of context.data.scopes) {
    assert.ok(scope.permissions.includes('work.write'));
    assert.equal(scope.policy.ai_external_processing, true);
  }

  const service = createClient(apiUrl, secret, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  const gateway = await service.rpc('mx_ops_mcp_gateway', {
    p_actor: signedIn.data.user.id,
    p_client: 'mineralx-local-verifier',
    p_aal: 'aal1',
    p_operation: 'mx_ops_context',
    p_args: {},
  });
  assert.ifError(gateway.error);
  assert.equal(gateway.data.userId, signedIn.data.user.id);

  const buckets = await service.storage.listBuckets();
  assert.ifError(buckets.error);
  const evidence = buckets.data.find((bucket) => bucket.id === 'mineralx-ops-evidence');
  assert.ok(evidence && evidence.public === false, 'The private evidence bucket is missing or public.');

  const oidc = await fetch(`${apiUrl}/auth/v1/.well-known/openid-configuration`);
  assert.equal(oidc.status, 200);
  const oauth = await fetch(`${apiUrl}/auth/v1/.well-known/oauth-authorization-server`);
  assert.equal(oauth.status, 200);
  const jwks = await fetch(`${apiUrl}/auth/v1/.well-known/jwks.json`).then((response) => response.json());
  assert.ok(jwks.keys?.some((key) => key.kty === 'EC' && key.alg === 'ES256' && !('d' in key)));

  const app = await localHttps('https://localhost:3000/ops/login');
  assert.equal(app.status, 200);
  const discovery = await localHttps('https://localhost:3000/.well-known/oauth-protected-resource/api/mcp');
  assert.equal(discovery.status, 200);
  const metadata = JSON.parse(discovery.body);
  assert.equal(metadata.resource, 'https://localhost:3000/api/mcp');
  assert.deepEqual(metadata.scopes_supported, ['openid', 'profile', 'email']);

  const mock = await fetch('http://127.0.0.1:4010/healthz', {
    headers: {Authorization: 'Bearer local-mock-only'},
  });
  assert.equal(mock.status, 200);
  await userClient.auth.signOut({scope: 'local'});

  console.log('PASS  local secrets/keys are owner-readable and endpoints are loopback-only');
  console.log('PASS  named user login, seeded scope access, and browser/MCP role separation');
  console.log('PASS  service gateway, private evidence bucket, ES256 OAuth/OIDC discovery');
  console.log('PASS  MineralX HTTPS app, MCP resource discovery, and deterministic AI fixture');
  console.log('MineralX local integration verification passed.');
}

main().catch((error) => {
  console.error(`Local verification failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

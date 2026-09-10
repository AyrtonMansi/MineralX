#!/usr/bin/env node

/**
 * Prepare a local-only MineralX integration environment.
 *
 * The command starts Supabase, creates or refreshes one named test account,
 * grants that account the deterministic seed scopes, and writes only local
 * credentials to the git-ignored .env.local file. It refuses non-loopback
 * Supabase or database endpoints.
 */

import {generateKeyPairSync, randomBytes, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const certificateDirectory = fileURLToPath(new URL('../certificates', import.meta.url));
const certificatePath = fileURLToPath(new URL('../certificates/localhost.pem', import.meta.url));
const certificateKeyPath = fileURLToPath(new URL('../certificates/localhost-key.pem', import.meta.url));
const signingKeyPath = fileURLToPath(new URL('../supabase/signing_key.json', import.meta.url));
const seedPath = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url));
const audience = 'https://localhost:3000/api/mcp';
const testEmailDefault = 'tester@mineralx.local';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';
const facilityId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const allProfiles = [
  'collector', 'geologist', 'lab_reviewer', 'operator', 'supervisor',
  'custodian', 'accountant', 'manager', 'auditor',
];

function redact(message) {
  return String(message || '')
    .replace(/eyJ[A-Za-z0-9_.-]{40,}/g, '[redacted-jwt]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_.-]+/g, '[redacted-supabase-key]')
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[redacted]@');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redact(result.stderr || result.stdout).trim().split('\n').slice(-18).join('\n');
    throw new Error(`${command} failed.${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout;
}

function statusValue(status, ...keys) {
  for (const key of keys) {
    if (typeof status[key] === 'string' && status[key]) return status[key];
    const match = Object.keys(status).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (match && typeof status[match] === 'string' && status[match]) return status[match];
  }
  return '';
}

function assertLoopback(value, label, protocols) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`${label} is not a valid URL.`); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const credentialsAllowed = label === 'Database URL';
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname) || !protocols.includes(url.protocol)
    || !credentialsAllowed && (url.username || url.password)) {
    throw new Error(`${label} must be a loopback ${protocols.join(' or ')} URL; refusing to alter an external environment.`);
  }
  return url;
}

function parseEnvFile(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function updateEnvFile(updates) {
  const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const managed = new Set(Object.keys(updates));
  const lines = original.split(/\r?\n/).filter((line) => {
    const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    return !key || !managed.has(key);
  });
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  if (lines.length) lines.push('');
  lines.push('# Managed by npm run local:setup. Local-only; never commit this file.');
  for (const [key, value] of Object.entries(updates)) {
    if (/[\r\n]/.test(value)) throw new Error(`Unsafe newline in ${key}.`);
    lines.push(`${key}=${value}`);
  }
  lines.push('');
  const temporary = `${envPath}.tmp`;
  writeFileSync(temporary, lines.join('\n'), {encoding: 'utf8', mode: 0o600});
  chmodSync(temporary, 0o600);
  renameSync(temporary, envPath);
}

function ensureLocalCertificate() {
  if (existsSync(certificatePath) && existsSync(certificateKeyPath)) {
    chmodSync(certificateKeyPath, 0o600);
    const valid = spawnSync('openssl', ['x509', '-checkend', '259200', '-noout', '-in', certificatePath], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    if (!valid.error && valid.status === 0) return;
  }
  mkdirSync(certificateDirectory, {recursive: true});
  const temporaryCertificate = `${certificatePath}.tmp`;
  const temporaryKey = `${certificateKeyPath}.tmp`;
  try {
    run('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '30', '-nodes',
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
      '-keyout', temporaryKey, '-out', temporaryCertificate,
    ]);
    chmodSync(temporaryKey, 0o600);
    renameSync(temporaryKey, certificateKeyPath);
    renameSync(temporaryCertificate, certificatePath);
  } finally {
    if (existsSync(temporaryKey)) unlinkSync(temporaryKey);
    if (existsSync(temporaryCertificate)) unlinkSync(temporaryCertificate);
  }
}

function ensureLocalSigningKey() {
  if (existsSync(signingKeyPath)) {
    let keys;
    try { keys = JSON.parse(readFileSync(signingKeyPath, 'utf8')); }
    catch { throw new Error('supabase/signing_key.json is invalid. Remove only that local file and rerun setup.'); }
    const key = Array.isArray(keys) && keys.length === 1 ? keys[0] : null;
    if (!key || key.kty !== 'EC' || key.crv !== 'P-256' || key.alg !== 'ES256'
      || key.use !== 'sig' || !key.d || !key.x || !key.y || !key.kid) {
      throw new Error('supabase/signing_key.json is not a private ES256 signing key. Remove only that local file and rerun setup.');
    }
    chmodSync(signingKeyPath, 0o600);
    return;
  }

  const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'P-256'});
  const key = {
    ...privateKey.export({format: 'jwk'}),
    alg: 'ES256',
    ext: true,
    key_ops: ['sign'],
    kid: randomUUID(),
    use: 'sig',
  };
  const temporary = `${signingKeyPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify([key], null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  chmodSync(temporary, 0o600);
  renameSync(temporary, signingKeyPath);
}

async function localUser(admin, email, password) {
  let page = 1;
  let existing;
  do {
    const {data, error} = await admin.auth.admin.listUsers({page, perPage: 200});
    if (error) throw error;
    existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (existing || data.users.length < 200) break;
    page += 1;
  } while (page <= 25);

  if (existing) {
    const {data, error} = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {...existing.user_metadata, display_name: 'MineralX Local Tester'},
    });
    if (error || !data.user) throw error || new Error('Local user update returned no user.');
    return data.user;
  }
  const {data, error} = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {display_name: 'MineralX Local Tester'},
  });
  if (error || !data.user) throw error || new Error('Local user creation returned no user.');
  return data.user;
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
  ensureLocalSigningKey();
  ensureLocalCertificate();
  console.log('Starting the isolated local Supabase stack…');
  run('supabase', ['start']);
  run('supabase', ['migration', 'up', '--local']);
  const status = JSON.parse(run('supabase', ['status', '--output', 'json']));
  const apiUrl = statusValue(status, 'API_URL');
  const dbUrl = statusValue(status, 'DB_URL');
  const publishableKey = statusValue(status, 'PUBLISHABLE_KEY', 'ANON_KEY');
  const serviceRoleKey = statusValue(status, 'SECRET_KEY', 'SERVICE_ROLE_KEY');
  if (!apiUrl || !dbUrl || !publishableKey || !serviceRoleKey) {
    throw new Error('Supabase did not report all required local API, database, and key values.');
  }
  assertLoopback(apiUrl, 'Supabase API URL', ['http:', 'https:']);
  const databaseUrl = assertLoopback(dbUrl, 'Database URL', ['postgres:', 'postgresql:']);
  run('psql', [
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl.toString(), '--file', seedPath,
  ]);
  // Local Supabase exposes an intentionally local superuser for configuring
  // Auth's database role. This derivation happens only after the loopback guard.
  const adminDatabaseUrl = new URL(databaseUrl);
  adminDatabaseUrl.username = 'supabase_admin';
  const adminDbUrl = adminDatabaseUrl.toString();

  const current = parseEnvFile(existsSync(envPath) ? readFileSync(envPath, 'utf8') : '');
  const email = (process.env.MINERALX_LOCAL_TEST_EMAIL || current.get('MINERALX_LOCAL_TEST_EMAIL') || testEmailDefault).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@mineralx\.local$/.test(email)) {
    throw new Error('The local test identity must use the non-deliverable @mineralx.local domain.');
  }
  const password = process.env.MINERALX_LOCAL_TEST_PASSWORD
    || (process.env.MINERALX_LOCAL_ROTATE_PASSWORD === '1' ? '' : current.get('MINERALX_LOCAL_TEST_PASSWORD'))
    || `MxLocal!${randomBytes(18).toString('base64url')}9a`;
  if (password.length < 12 || /[\r\n]/.test(password)) throw new Error('The local test password must be at least 12 characters without line breaks.');

  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  const user = await localUser(admin, email, password);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
    throw new Error('Supabase returned an invalid local user ID.');
  }

  const profiles = `array[${allProfiles.map(quoteSqlLiteral).join(',')}]::text[]`;
  const grants = `
begin;
insert into public.gic_members(workspace_id,user_id,role)
values (${quoteSqlLiteral(workspaceId)}::uuid,${quoteSqlLiteral(user.id)}::uuid,'owner')
on conflict(user_id) do update set workspace_id=excluded.workspace_id,role=excluded.role;
insert into mx_ops.administrators(org_id,user_id,revoked_at)
values (${quoteSqlLiteral(organisationId)}::uuid,${quoteSqlLiteral(user.id)}::uuid,null)
on conflict(org_id,user_id) do update set revoked_at=null;
insert into mx_ops.members(scope_id,user_id,profiles,expires_at,revoked_at)
values
 (${quoteSqlLiteral(facilityId)}::uuid,${quoteSqlLiteral(user.id)}::uuid,${profiles},null,null),
 (${quoteSqlLiteral(projectId)}::uuid,${quoteSqlLiteral(user.id)}::uuid,${profiles},null,null)
on conflict(scope_id,user_id) do update
set profiles=excluded.profiles,expires_at=null,revoked_at=null,version=mx_ops.members.version+1;
commit;
alter database postgres set "app.settings.mineralx_mcp_audience" to ${quoteSqlLiteral(audience)};
alter role supabase_auth_admin set "app.settings.mineralx_mcp_audience" to ${quoteSqlLiteral(audience)};
`;
  run('psql', ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', adminDbUrl, '--command', grants]);
  // Force only Auth's pooled database connections to reopen and inherit the
  // new local audience. The database and user data remain running and intact.
  run('psql', [
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', adminDbUrl, '--command',
    "select pg_terminate_backend(pid) from pg_stat_activity where usename='supabase_auth_admin' and pid<>pg_backend_pid();",
  ]);

  updateEnvFile({
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    MINERALX_PUBLIC_ORIGIN: 'https://localhost:3000',
    MINERALX_MCP_AUDIENCE: audience,
    MINERALX_MCP_ALLOWED_HOSTS: 'localhost,127.0.0.1,[::1]',
    MINERALX_MCP_ALLOWED_ORIGINS: 'https://localhost:3000,http://localhost:6274,http://127.0.0.1:6274',
    MINERALX_MCP_REQUIRE_OAUTH_CLIENT: 'on',
    MINERALX_AI_EXTERNAL_PROCESSING: 'enabled',
    MINERALX_AI_SCOPE_IDS: `${facilityId},${projectId}`,
    MINERALX_AI_MODEL: 'mineralx-local-fixture',
    MINERALX_AI_RESPONSES_URL: 'http://127.0.0.1:4010/v1/responses',
    OPENAI_API_KEY: 'local-mock-only',
    MINERALX_LOCAL_TEST_EMAIL: email,
    MINERALX_LOCAL_TEST_PASSWORD: password,
    MINERALX_LOCAL_FACILITY_ID: facilityId,
    MINERALX_LOCAL_PROJECT_ID: projectId,
  });

  console.log('Local MineralX setup is ready.');
  console.log('  • Named test identity and both test workspaces are configured.');
  console.log('  • OAuth audience, private Storage, and the local AI fixture are configured.');
  console.log('  • Login values are stored only in the git-ignored .env.local file.');
  console.log('Next: run npm run local:ai and npm run dev:https in separate terminals.');
}

main().catch((error) => {
  console.error(`Local setup failed: ${redact(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Local-only full browser check for the Intelligence inbox.
 *
 * This creates one real test intake and governed document in the seeded local
 * facility. A temporary TOTP factor is removed in finally so a developer can
 * enrol their own authenticator immediately afterward.
 */

import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const fixturePath = fileURLToPath(new URL('../examples/intelligence/sample-shift-handover.txt', import.meta.url));
const screenshotPath = fileURLToPath(new URL('../test-results/intelligence-local-e2e.png', import.meta.url));
const facilityId = '33333333-3333-4333-8333-333333333333';

function envFile() {
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
  }
  return values;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    const index = alphabet.indexOf(character);
    assert.notEqual(index, -1, 'Supabase returned an invalid TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, time = Date.now()) {
  const counter = Math.floor(time / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest.at(-1) & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, '0');
}

async function factors(admin, userId) {
  const result = await admin.auth.admin.mfa.listFactors({userId});
  assert.ifError(result.error);
  return result.data?.factors || [];
}

async function clearFactors(admin, userId) {
  for (const factor of await factors(admin, userId)) {
    const removed = await admin.auth.admin.mfa.deleteFactor({userId, id: factor.id});
    assert.ifError(removed.error);
  }
}

async function findUser(admin, email) {
  for (let page = 1; page <= 25; page += 1) {
    const result = await admin.auth.admin.listUsers({page, perPage: 200});
    assert.ifError(result.error);
    const found = result.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (result.data.users.length < 200) break;
  }
  throw new Error('The local test user is missing. Run npm run local:setup.');
}

async function main() {
  const values = envFile();
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'MINERALX_LOCAL_TEST_EMAIL', 'MINERALX_LOCAL_TEST_PASSWORD',
  ];
  for (const key of required) assert.ok(values[key], `Missing ${key}; run npm run local:setup.`);
  const api = new URL(values.NEXT_PUBLIC_SUPABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(api.hostname));
  const admin = createClient(api.toString(), values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  const user = await findUser(admin, values.MINERALX_LOCAL_TEST_EMAIL);
  await clearFactors(admin, user.id);

  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  try {
    await page.goto('https://localhost:3000/ops/login', {waitUntil: 'domcontentloaded'});
    await page.locator('form button.ops-primary:not([disabled])').waitFor({timeout: 20_000});
    await page.getByLabel('Email').fill(values.MINERALX_LOCAL_TEST_EMAIL);
    await page.getByLabel('Password').fill(values.MINERALX_LOCAL_TEST_PASSWORD);
    await page.getByRole('button', {name: 'Sign in'}).click();
    await page.waitForURL((url) => url.origin === 'https://localhost:3000' && url.pathname === '/ops', {timeout: 30_000});
    // The protected shell probes session state while the anonymous login page
    // hydrates, so its expected 401 is outside the authenticated workflow under test.
    consoleErrors.length = 0;

    await page.goto(`https://localhost:3000/ops/account?scope=${facilityId}`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('heading', {name: 'Your account'}).waitFor();
    await page.getByText('Connected to MineralX', {exact: true}).waitFor({timeout: 20_000});
    await page.getByRole('button', {name: 'Set up or verify authenticator'}).click();
    const secretLocator = page.locator('code').first();
    await Promise.race([
      secretLocator.waitFor({state: 'attached', timeout: 30_000}),
      page.locator('.ops-message[role="alert"]').waitFor({timeout: 30_000}).then(async () => {
        throw new Error(`Authenticator enrolment failed: ${await page.locator('.ops-message[role="alert"]').innerText()}`);
      }),
    ]);
    const secret = (await secretLocator.textContent())?.trim();
    assert.ok(secret, 'The local authenticator setup did not return a secret.');
    await page.getByLabel('Current six-digit code').fill(totp(secret));
    await page.getByRole('button', {name: 'Verify account'}).click();
    await page.getByText('Account verified. You can return to your review.').waitFor({timeout: 20_000});

    await page.goto(`https://localhost:3000/ops/intelligence?scope=${facilityId}`, {waitUntil: 'domcontentloaded'});
    await page.getByRole('heading', {name: 'Intelligence inbox'}).waitFor();
    await page.getByText('Connected to MineralX', {exact: true}).waitFor({timeout: 20_000});
    await page.getByLabel('Store originals with').selectOption('plant');
    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await page.locator('.ops-intelligence-upload-list').getByText('Verified', {exact: true}).waitFor({timeout: 30_000});
    await page.getByLabel('Instruction').fill('Organise this local shift handover as a controlled MineralX document.');
    await page.getByRole('button', {name: 'Prepare for review'}).click();

    await page.getByRole('heading', {name: 'Proposed result'}).waitFor({timeout: 120_000});
    await page.getByText('document.publish', {exact: true}).first().waitFor();
    await page.getByText('sample-shift-handover.txt', {exact: true}).first().waitFor();
    await page.waitForLoadState('networkidle');
    const approvalReason = 'Verified local source, destination, and proposed document fields.';
    const approvalInput = page.getByLabel('Approval reason');
    await approvalInput.fill(approvalReason);
    assert.equal(await approvalInput.inputValue(), approvalReason, 'The approval reason was not retained.');
    await page.locator('button.ops-primary:not([disabled])', {hasText: 'Approve proposal'}).click();
    await page.getByRole('heading', {name: 'Approved — application pending'}).waitFor({timeout: 30_000});
    await page.getByRole('button', {name: 'Apply approved change'}).click();
    await page.getByRole('heading', {name: 'Change applied'}).waitFor({timeout: 30_000});
    await page.getByText(/1 governed action receipt/).waitFor();

    assert.equal(await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count(), 0);
    await page.screenshot({path: screenshotPath, fullPage: true});
    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('PASS  named login and temporary TOTP verification');
    console.log('PASS  private source upload, hash verification, scan, and structured proposal');
    console.log('PASS  explicit approval followed by separate governed application');
    console.log('PASS  completed document action has one execution receipt and no browser errors');
    console.log(`Screenshot: ${screenshotPath}`);
  } catch (error) {
    await page.screenshot({path: screenshotPath, fullPage: true}).catch(() => undefined);
    const alerts = await page.locator('.ops-message[role="alert"]').allInnerTexts().catch(() => []);
    const detail = alerts.length ? ` Alerts: ${alerts.join(' | ')}` : '';
    throw new Error(`${error instanceof Error ? error.message : error} URL: ${page.url()}.${detail}`);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await clearFactors(admin, user.id).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`Intelligence UI verification failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

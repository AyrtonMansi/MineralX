import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSignInLanding, safeSignInNext, signInFailureMessage, resetFailureMessage } from '../../lib/gic/login-routing';
const absent = async () => ({ data: null, error: { code: 'PGRST202' } });
const ready = async () => ({ data: { userId: 'account-a', schemaVersion: 6 }, error: null });
function input(overrides: Partial<Parameters<typeof resolveSignInLanding>[0]> = {}) {
  return { userId: 'account-a', requestedNext: '/ops/admin', requiredSchema: 6, readOperations: absent,
    readLegacy: async (userId: string) => { assert.equal(userId, 'account-a'); return { data: [{ role: 'owner' }], error: null }; }, ...overrides };
}
test('verified existing owner reaches Admin to connect their operation while Operations schema is absent', async () => {
  assert.deepEqual(await resolveSignInLanding(input()), { destination: '/ops/admin', operationsReady: false });
});
test('outdated Operations schema does not lock out the existing owner', async () => {
  assert.equal((await resolveSignInLanding(input({readOperations: async () => ({data: {userId:'account-a',schemaVersion:5},error:null})}))).destination, '/ops/admin');
});
test('activated Operations retains the requested admin workspace without consulting legacy roles', async () => {
  assert.deepEqual(await resolveSignInLanding(input({readOperations: ready, readLegacy: async () => {throw new Error('Legacy must not be needed');}})), {destination:'/ops/admin',operationsReady:true});
});
test('password and MFA recovery remain reachable independently of Operations activation', async () => {
  const fail = async () => { throw new Error('Account management must not query project membership'); };
  assert.deepEqual(await resolveSignInLanding(input({requestedNext:'/ops/account?return=review',readOperations:fail,readLegacy:fail})), {destination:'/ops/account?return=review',operationsReady:false});
});
test('an unassigned account is never promoted or routed through another member', async () => {
  assert.equal((await resolveSignInLanding(input({readLegacy:async () => ({data:[],error:null})}))).destination,'/ops');
});
test('ambiguous legacy workspaces fail closed rather than choosing one', async () => {
  assert.equal((await resolveSignInLanding(input({readLegacy:async () => ({data:[{role:'owner'},{role:'owner'}],error:null})}))).destination,'/ops');
});
test('legacy lookup errors and unexpected roles cannot establish access', async () => {
  for (const result of [{data:[{role:'owner'}],error:{code:'42501'}},{data:[{role:'admin'}],error:null}]) {
    assert.equal((await resolveSignInLanding(input({readLegacy:async () => result}))).destination,'/ops');
  }
});
test('a stale or different Operations identity never falls back to privileged legacy navigation', async () => {
  await assert.rejects(resolveSignInLanding(input({readOperations:async () => ({data:{userId:'account-b',schemaVersion:6},error:null})})),/verification changed/);
});
test('read-only legacy accounts land on Operations with no admin authority, not a retired register route', async () => {
  assert.equal((await resolveSignInLanding(input({readLegacy:async () => ({data:[{role:'viewer'}],error:null})}))).destination,'/ops');
});
test('transport failure in the new schema does not remove an existing owner\'s path to Admin', async () => {
  assert.equal((await resolveSignInLanding(input({readOperations:async () => {throw new Error('offline RPC');}}))).destination,'/ops/admin');
});
test('no unverified identity is accepted', async () => {
  await assert.rejects(resolveSignInLanding(input({userId:''})),/verified account/);
});
test('post-sign-in paths reject external redirects, escaped separators and auth loops', () => {
  for (const value of ['https://evil.example','//evil.example','/\\evil.example','/ops/../../elsewhere','/ops/auth/continue','/ops/login','/ops/login/','/ops/%2f%2fevil','/ops/%5cevil','/ops/\u0000','/gic']) {
    assert.equal(safeSignInNext(value),'/ops',value);
  }
  assert.equal(safeSignInNext('/ops/geology?scope=project-a#unused'),'/ops/geology?scope=project-a');
});
test('provider outage and throttling are not described as incorrect credentials', () => {
  assert.match(signInFailureMessage({name:'AuthRetryableFetchError'}),/service could not/);
  assert.match(signInFailureMessage({status:503}),/service could not/);
  assert.match(signInFailureMessage({status:429}),/Too many/);
  assert.match(signInFailureMessage({code:'invalid_credentials'}),/email and password/);
});
test('reset failures never claim an email was requested or disclose provider details', () => {
  assert.match(resetFailureMessage({status:429}),/rate-limited/);
  assert.match(resetFailureMessage({status:500,message:'private@example.com'}),/No reset has been confirmed/);
  assert.doesNotMatch(resetFailureMessage({message:'private@example.com'}),/private@/);
});

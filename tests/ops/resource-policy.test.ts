import test from 'node:test';
import assert from 'node:assert/strict';
import { OpsError } from '../../lib/ops/contracts';
import { retainResourceOnFailure } from '../../lib/ops/resource-policy';

test('only a transient unavailable response keeps a confirmed resource visible', () => {
  assert.equal(retainResourceOnFailure(new OpsError('unavailable', 'Temporary outage')), true);
  assert.equal(retainResourceOnFailure(new OpsError('forbidden', 'Membership revoked')), false);
  assert.equal(retainResourceOnFailure(new OpsError('unauthenticated', 'Sign in again')), false);
  assert.equal(retainResourceOnFailure(new Error('Unknown failure')), false);
});

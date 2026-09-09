import assert from 'node:assert/strict';
import test from 'node:test';
import { noStore, privateResponseHeaders } from '../../lib/ops/http';

test('private Operations responses consistently prevent storage, indexing and framing', () => {
  const response = noStore({ ok: true });

  for (const [name, value] of Object.entries(privateResponseHeaders)) {
    assert.equal(response.headers.get(name), value, `${name} must be present on a private response`);
  }
});

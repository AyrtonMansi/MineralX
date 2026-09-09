import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, PATCH, POST } from '../../app/api/plant/notes/route';

test('the public plant reference never proxies writable review notes', async () => {
  for (const handler of [GET, POST, PATCH]) {
    const response = await handler();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match((await response.json()).error, /read-only/i);
  }
});

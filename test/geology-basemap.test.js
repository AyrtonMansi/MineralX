import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../app/api/basemap/[...tile]/route.js';
const call=tile=>GET(new Request('https://example.test/api/basemap/x'),{params:Promise.resolve({tile})});
test('basemap bounds validation rejects invalid tiles before any upstream fetch',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Should not fetch');});
 for(const parts of [['satellite','1','2','0'],['topo','23','0','0'],['bad','1','0','0'],['satellite','0','-1','0'],['satellite','1','0']])assert.equal((await call(parts)).status,400);
 assert.equal(calls,0);
});
test('upstream failure returns a valid non-cacheable fallback, not a successful cached tile',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('failed',{status:500}));const r=await call(['satellite','1','0','0']);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-mineralx-tile-status'),'unavailable');assert.deepEqual([...new Uint8Array(await r.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
});
test('available imagery retains its media type and explicit availability marker',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}}));const r=await call(['satellite','1','0','0']);assert.equal(r.headers.get('x-mineralx-tile-status'),'available');assert.equal(r.headers.get('content-type'),'image/jpeg');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);
});

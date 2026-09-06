import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = '/workspace/scratch/394df3e5da33/mineralx-geology-implementation';
const { GET } = await import(`${root}/app/api/basemap/[...tile]/route.js`);
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
let calls = 0, requestUrl;
global.fetch = async url => { calls++; requestUrl = url; return new Response(png, { headers: { 'Content-Type': 'image/png' } }); };
let response = await GET(null, { params: Promise.resolve({ tile: ['satellite', '3', '2', '1'] }) });
assert.equal(response.headers.get('X-MineralX-Tile-Status'), 'available');
assert.ok(requestUrl.endsWith('/3/1/2'));
for (const tile of [['satellite','2','4','0'], ['satellite','23','0','0'], ['topo','2','0','1','extra'], ['__proto__','2','0','0']]) {
  const count = calls; assert.equal((await GET(null,{params:Promise.resolve({tile})})).status, 400); assert.equal(calls,count);
}
for (const upstream of [() => new Response('outage', {status:503}), () => new Response('<html>wrong response</html>',{headers:{'Content-Type':'text/html'}}), () => {throw new Error('network');}]) {
  global.fetch = async () => upstream(); response = await GET(null,{params:Promise.resolve({tile:['topo','1','0','0']})});
  assert.equal(response.status,200); assert.equal(response.headers.get('X-MineralX-Tile-Status'),'unavailable');
  assert.equal(response.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.equal(new Uint8Array(await response.arrayBuffer())[0],137);
}
console.log('Basemap contracts passed: promised params, XYZ bounds, image validation, unavailable tile non-caching.');

const listeners = {}, cacheMaps = new Map(), origin = 'https://example.test';
const keyOf = key => typeof key === 'string' ? new URL(key,origin).href : key.url;
const caches = {
  keys: async () => [...cacheMaps.keys()], delete: async name => cacheMaps.delete(name),
  open: async name => { if (!cacheMaps.has(name)) cacheMaps.set(name,new Map()); const map=cacheMaps.get(name); return {
    keys: async () => [...map.keys()].map(url=>({url})), delete:async key=>map.delete(keyOf(key)),
    put: async (key,value)=>map.set(keyOf(key),value.clone()), match: async key=>map.get(keyOf(key))?.clone(),
  }; },
};
let offline = false, marked = true, unavailable = false;
const context = { URL, Response, Uint8Array, atob, AbortSignal, Set, Promise, console, caches,
  self:{location:{origin},addEventListener:(name,handler)=>listeners[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  fetch:async input=>{
    if(offline)throw new Error('offline'); const url=keyOf(input);
    if(url===`${origin}/mineralx`)return new Response('<html><script src="/_next/static/shell.js"></script>device shell</html>',{headers:{'Content-Type':'text/html',...(marked?{'X-MineralX-Offline-Shell':'device-shell'}:{})}});
    if(url.includes('/api/basemap/'))return new Response(png,{headers:{'Content-Type':'image/png','X-MineralX-Tile-Status':unavailable?'unavailable':'available'}});
    return new Response('interface asset',{headers:{'Content-Type':'text/javascript'}});
  },
};
vm.runInNewContext(await readFile(`${root}/public/mineralx-sw.js`,'utf8'),context);
async function message(data) { let result,promise; listeners.message({data,ports:[{postMessage:value=>{result=value;}}],waitUntil:value=>{promise=value;}}); await promise; return result; }
async function request(path,mode='cors') {let response,used=false; listeners.fetch({request:{url:`${origin}${path}`,method:'GET',mode},respondWith:value=>{response=value;used=true;}});return {used,response:used?await response:null};}
for(const path of ['/api/geology/projects','/api/extract','/mineralx/login','/mineralx/auth/complete','/mineralx?_rsc=1']) assert.equal((await request(path,path.includes('/api/')?'cors':'navigate')).used,false);
marked=false; assert.match((await message({type:'PREPARE',assets:[`${origin}/_next/static/shell.js`]})).error,/unavailable/);assert.equal((await message({type:'STATUS'})).ready,false);
marked=true; const prepared=await message({type:'PREPARE',assets:[`${origin}/_next/static/shell.js`]});assert.equal(prepared.ready,true);assert.equal(prepared.assets,1);
unavailable=true;await request('/api/basemap/topo/2/0/0');assert.equal((await message({type:'STATUS'})).tiles,0);
unavailable=false;for(let x=0;x<100;x++)await request(`/api/basemap/topo/7/${x}/0`);assert.equal((await message({type:'STATUS'})).tiles,96);
offline=true; const shell=await request('/mineralx','navigate');assert.match(await shell.response.text(),/device shell/);
const tile=await request('/api/basemap/topo/7/99/0');assert.equal(tile.response.headers.get('X-MineralX-Tile-Status'),'available');
const absent=await request('/api/basemap/topo/7/120/0');assert.equal(absent.response.headers.get('X-MineralX-Tile-Status'),'unavailable');
console.log('Service worker contracts passed: private/API bypass, explicit anonymous shell cache, failed setup rejection,96 visited-tile bound, unavailable tile exclusion, offline shell/tile fallback.');
console.log('These are isolated mocked contracts, not browser or field offline certification.');

/* Generic offline shell only; operational APIs and evidence are never cached. */
const CACHE='mineralx-ops-shell-2026.09.07.6';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type!=='prepare-shell')return;event.waitUntil((async()=>{
 try{
  const cache=await caches.open(CACHE);
  const response=await fetch('/ops/field',{credentials:'omit',cache:'no-store'});
  if(!response.ok)throw new Error('Field shell unavailable');
  const html=await response.text();
  const referenced=[...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)].map(m=>m[1]);
  const assets=[...new Set([...referenced,...(event.data.assets||[])])].filter(url=>{try{const u=new URL(url,self.location.origin);return u.origin===self.location.origin&&u.pathname.startsWith('/_next/static/');}catch{return false;}});
  if(!referenced.length)throw new Error('Field build assets unavailable');
  await Promise.all(assets.map(async url=>{const r=await fetch(url,{credentials:'omit'});if(!r.ok)throw new Error('Missing application asset');await cache.put(url,r);}));
  await cache.put('/ops/field',new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  event.source?.postMessage({type:'ops-shell-ready'});
 }catch{event.source?.postMessage({type:'ops-shell-error'});}
 })());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/_next/static/')){event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());return;}
 if(request.mode==='navigate'&&(url.pathname==='/ops'||url.pathname.startsWith('/ops/')))event.respondWith(fetch(request).catch(async()=>{const response=await (await caches.open(CACHE)).match('/ops/field');return response||new Response('Reconnect and prepare the Operations field page before offline use.',{status:503,headers:{'Content-Type':'text/plain'}});}));
});

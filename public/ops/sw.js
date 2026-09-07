/* Offline shell only. Shared records, auth responses, RSC payloads and evidence
   are never cached here. Account data lives in the encrypted IndexedDB vault. */
const CACHE='mineralx-ops-shell-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type!=='prepare-shell')return;event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // /ops/field contains only the client shell, with no server-rendered staff data.
 const shell=await fetch('/ops/field',{credentials:'omit',cache:'reload'});if(!shell.ok)throw new Error('Field shell unavailable');await cache.put('/ops/field',shell);
 const assets=[...new Set(event.data.assets||[])].filter(url=>{const u=new URL(url,self.location.origin);return u.origin===self.location.origin&&u.pathname.startsWith('/_next/static/');});
 await Promise.all(assets.map(async url=>{const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('Missing application asset');await cache.put(url,response);}));
 event.source?.postMessage({type:'ops-shell-ready'});
 })());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/_next/static/')){event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());return;}
 if(request.mode==='navigate'&&url.pathname.startsWith('/ops/'))event.respondWith(fetch(request).catch(async()=>{const response=await (await caches.open(CACHE)).match('/ops/field');return response||new Response('Reconnect and prepare the Operations field page before offline use.',{status:503,headers:{'Content-Type':'text/plain'}});}));
});

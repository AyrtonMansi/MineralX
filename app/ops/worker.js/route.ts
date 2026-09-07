import {OPS_RELEASE} from '@/lib/ops/contracts';
export const dynamic='force-dynamic';
export function GET(){const source=`
'use strict';
const CACHE='mineralx-ops-shell-${OPS_RELEASE}',PREFIX='mineralx-ops-shell-';
self.addEventListener('install',()=>{});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Cache only a generic, client-rendered unlock document and public build assets.
// Never cache APIs, authenticated reports, source files, or personalised HTML.
self.addEventListener('message',event=>{if(event.data?.type!=='PREPARE_FIELD_SHELL')return;event.waitUntil((async()=>{try{
 const cache=await caches.open(CACHE);const res=await fetch('/ops/field',{cache:'no-store',credentials:'same-origin'});if(!res.ok)throw new Error('The field screen could not be fetched.');
 const html=await res.text();const assets=[...new Set([...html.matchAll(/(?:src|href)=["'](\\/_next\\/static\\/[^"']+)["']/g)].map(m=>m[1]))];
 if(!assets.length)throw new Error('Field build assets were not found.');
 for(const path of assets){const r=await fetch(path,{cache:'reload',credentials:'omit'});if(!r.ok)throw new Error('A required field asset is unavailable.');await cache.put(path,r);}
 await cache.put('/ops/field',new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));event.ports[0]?.postMessage({ok:true,assets:assets.length});
 }catch(e){event.ports[0]?.postMessage({ok:false,error:e.message});}})());});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 if(u.pathname.startsWith('/_next/static/')){event.respondWith((async()=>{const cache=await caches.open(CACHE);const saved=await cache.match(event.request);if(saved)return saved;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;})());return;}
 if(event.request.mode==='navigate'&&u.pathname.startsWith('/ops'))event.respondWith(fetch(event.request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match('/ops/field')||new Response('Offline field screen is not prepared. Reconnect; your encrypted device records have not been removed.',{status:503,headers:{'Content-Type':'text/plain'}});}));
});`;
return new Response(source,{headers:{'Content-Type':'application/javascript','Cache-Control':'no-cache','Service-Worker-Allowed':'/ops/','X-Content-Type-Options':'nosniff'}});}

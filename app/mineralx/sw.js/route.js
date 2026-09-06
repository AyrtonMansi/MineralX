const worker = `
const CACHE='mineralx-geology-shell-20260906-v1';
const isAsset=url=>url.origin===self.location.origin && url.pathname.startsWith('/_next/static/') && /\\.(js|css|woff2?)(?:$)/.test(url.pathname);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const response=await fetch('/mineralx',{cache:'reload',credentials:'omit'});
  if(response.ok)await cache.put('/mineralx',response);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='CACHE_GEOLOGY_ASSETS'||!Array.isArray(event.data.urls))return;
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const urls=[...new Set(event.data.urls)].slice(0,150).map(value=>{try{return new URL(value,self.location.origin);}catch{return null;}}).filter(url=>url&&isAsset(url));
    let failed=0;
    await Promise.all(urls.map(async url=>{try{const response=await fetch(url.href,{credentials:'omit'});if(response.ok)await cache.put(url.href,response);else failed++;}catch{failed++;}}));
    event.source?.postMessage({type:'GEOLOGY_OFFLINE_READY',ready:failed===0&&urls.length>0});
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'&&(url.pathname==='/mineralx'||url.pathname==='/mineralx/')){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const response=await fetch(request);if(response.ok)await cache.put('/mineralx',response.clone());return response;}
      catch{return await cache.match('/mineralx')||new Response('Reconnect once to prepare the MineralX field workspace.',{status:503,headers:{'Content-Type':'text/plain'}});}
    })());
  }else if(isAsset(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),hit=await cache.match(request);
      if(hit)return hit;
      const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;
    })());
  }
  // Never cache API responses, GIC/plant pages, laboratory files, or map-provider requests.
});
`;
export function GET(){return new Response(worker,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','Service-Worker-Allowed':'/mineralx'}});}

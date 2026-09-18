const CACHE='broomstick-v10';
const ASSETS=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE)
  .then(c=>c.addAll(ASSETS).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys()
  .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  /* Navigations go network-first so a returning player always gets the latest
     build when online; everything else (icons, manifest) is cache-first since
     it never changes without a new filename. Both fall back to cache offline. */
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(resp=>{
      if(resp&&resp.status===200){const c=resp.clone();
        caches.open(CACHE).then(k=>k.put(e.request,c));}
      return resp;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)
    .then(resp=>{if(resp&&resp.status===200){const c=resp.clone();
      caches.open(CACHE).then(k=>k.put(e.request,c));}return resp;})
    .catch(()=>caches.match('./index.html'))));});

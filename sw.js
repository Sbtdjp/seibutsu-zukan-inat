const CACHE="seibutsu-zukan-v3";
const CORE=["./","./index.html","./app.js","./manifest.webmanifest","./icon-180.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;const u=new URL(e.request.url);if(u.origin===location.origin)e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{let copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy));return r}).catch(()=>c)))});

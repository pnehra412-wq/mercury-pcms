const CACHE="mercury-pcms-shell-v6";
const SHELL=["./","./manifest.json","./icon.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("mercury-pcms-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(request.destination==="script"||request.destination==="style"||request.destination==="font"){
  event.respondWith(caches.open(CACHE).then(async cache=>{try{const response=await fetch(request);if(response&&(response.ok||response.type==="opaque"))cache.put(request,response.clone());return response;}catch(error){const cached=await cache.match(request);if(cached)return cached;throw error;}}));
  return;
 }
 if(url.origin===self.location.origin&&request.mode==="navigate"){
  event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put("./",copy));return response;}).catch(()=>caches.match("./")));
 }
});
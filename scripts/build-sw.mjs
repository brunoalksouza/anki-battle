import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const assets = readdirSync("dist/assets").map((x) => "/assets/" + x);
const version = createHash("sha256")
  .update(readFileSync("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
writeFileSync(
  "dist/sw.js",
  `const CACHE='anki-shell-${version}';
const FILES=${JSON.stringify(["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable.png", "/icon.svg", "/fonts.css", ...assets])};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
// Never skip waiting automatically: an active study session keeps its code.
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// Account data/media never enter a shared service-worker cache.
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||u.pathname.startsWith('/api/')||e.request.method!=='GET')return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}
if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});`,
);
console.log("Service worker built:", version, assets.length, "bundled assets");

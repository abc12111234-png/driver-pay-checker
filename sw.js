// Keeps the pages usable where there is no signal. It stores only the site's own files, never the records
// (those stay in the browser's localStorage). Pages: network first so updates show at once; the stored copy
// is used when offline or when the network takes more than 4 seconds. Icons and the manifest: stored copy first.
// Change CACHE when the icons or the manifest change.
// ads.js (the referrals) is not stored on purpose: a change to it shows without a new CACHE name, and no ad is shown without a signal.
const CACHE = 'dpc-2026-10-12d';
const CORE = ['./', 'index.html', 'log.html', 'shindan.html', 'about.html', 'privacy.html', 'log.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('dpc-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const keyOf = url => { const u = new URL(url); u.search = ''; u.hash = ''; return u.toString(); };
const stored = req => caches.open(CACHE).then(c => c.match(keyOf(req.url)));

function pageFirst(req){
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (settled || !r) return false; settled = true; resolve(r); return true; };
    const timer = setTimeout(() => { stored(req).then(finish); }, 4000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(keyOf(req.url), copy)); }
      finish(res);
    }).catch(() => {
      clearTimeout(timer);
      stored(req).then(r => { if (!finish(r)) finish(Response.error()); });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;   // fonts and analytics go straight to the network
  if (req.mode === 'navigate'){ e.respondWith(pageFirst(req)); return; }
  e.respondWith(stored(req).then(r => r || fetch(req)));
});

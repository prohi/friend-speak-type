/* Offline működés: minden fájlt a készülék gyorsítótárából szolgál ki.
 * A kód (SMALL) verziózott gyorsítótárban van, a nagy, ritkán változó fájlok (BIG) külön, állandó gyorsítótárban,
 * így egy kódfrissítés nem tölti le újra a ~90 MB-nyi hangmodellt. A CACHE nevét minden kiadásnál növelni kell. */
const CACHE = 'fst-v8';
const ASSETS = 'fst-assets-1';

const SMALL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/app.js', 'js/store.js', 'js/tts.js', 'js/tts-worker.js', 'js/predict.js', 'js/touch.js', 'js/keyboard.js',
  'data/words-hu.txt', 'data/phrases-hu.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/lexend-latin-400.woff2', 'fonts/lexend-latin-700.woff2', 'fonts/lexend-latin-ext-400.woff2', 'fonts/lexend-latin-ext-700.woff2',
  'vendor/ort/ort.wasm.min.js', 'vendor/piper/piper_phonemize.js', 'vendor/piper/piper_phonemize.wasm',
  'voices/hu_HU-anna-medium.onnx.json',
];

const BIG = [
  'vendor/ort/ort-wasm-simd.wasm',
  'vendor/piper/piper_phonemize.data',
  'voices/hu_HU-anna-medium.onnx',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // A böngésző HTTP-gyorsítótára (GitHub Pages: 10 perc) nem adhat régi fájlt az új verzióhoz, ezért mindig a hálózatról kérünk.
    await Promise.all(SMALL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    // A nagy fájlok hibája nem akadályozhatja a telepítést; futás közben újra megpróbálja a gyorsítótárazást.
    const assets = await caches.open(ASSETS);
    await Promise.allSettled(BIG.map(async (u) => {
      if (await assets.match(u)) return;
      const old = await caches.match(u); // egy korábbi verzió gyorsítótárából átemeljük, nem töltjük le újra
      if (old) await assets.put(u, old.clone());
      else await assets.add(new Request(u, { cache: 'reload' }));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== ASSETS) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/reset.html')) return; // a visszaállító oldal mindig a hálózatról jön, sosem kerül gyorsítótárba
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) {
        const isBig = BIG.some((u) => req.url.endsWith(u));
        (await caches.open(isBig ? ASSETS : CACHE)).put(req, res.clone());
      }
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

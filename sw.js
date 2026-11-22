/* Offline működés: minden fájlt a készülék gyorsítótárából szolgál ki. */
const CACHE = 'fst-v2';

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
    await cache.addAll(SMALL);
    // A nagy fájlok hibája nem akadályozhatja a telepítést; futás közben újra megpróbálja a gyorsítótárazást.
    await Promise.allSettled(BIG.map((u) => cache.add(u)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

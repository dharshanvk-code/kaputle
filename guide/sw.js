// Lets Kaputle open and run without a network once it has been opened, like an installed app.
//
// The guide's own files (pages, code, product files, pictures) are fetched fresh whenever there's
// a connection, so updates show up straight away, and come from the cache when there isn't.
// three.js and the fonts come from versioned CDN addresses that never change, so those come
// from the cache first. A guide works offline once it has been opened online.

const CACHE = 'kaputle-v1';
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';

// Fetched when the app is installed, so the home screen and the player work offline at once.
const SHELL = [
  './', 'index.html', 'library.html', 'guide.css', 'manifest.webmanifest', 'favicon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'products/index.json',
  'src/analytics.js', 'src/app.js', 'src/assembly.js', 'src/camera.js', 'src/config.js', 'src/diagram.js',
  'src/holes.js', 'src/info.js', 'src/library.js', 'src/main.js', 'src/parts.js', 'src/pile.js',
  'src/scene.js', 'src/state.js', 'src/steps.js', 'src/textures.js', 'src/tween.js', 'src/ui.js',
  `${THREE}build/three.module.js`,
  `${THREE}examples/jsm/controls/OrbitControls.js`,
  `${THREE}examples/jsm/geometries/RoundedBoxGeometry.js`,
  `${THREE}examples/jsm/environments/RoomEnvironment.js`,
  `${THREE}examples/jsm/utils/BufferGeometryUtils.js`,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // The home screen's pictures too, so the list of guides looks right offline.
    const guides = await (await fetch('products/index.json')).json();
    await cache.addAll(guides.map((g) => g.image));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const neverChanges = (url) => url.href.startsWith(THREE) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (neverChanges(url)) {
    event.respondWith(cacheFirst(request));
  } else if (url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    event.respondWith(networkFirst(request));
  }
  // Anything else (visit counting, other sites) goes to the network as usual.
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (err) {
    // Offline. A guide address carries ?product=..., but the page itself is the same file.
    const cached = await caches.match(request) || await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

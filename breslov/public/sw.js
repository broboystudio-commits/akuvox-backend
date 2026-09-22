/* Breslov Daily -- offline support.
 *
 * Two rules learned the hard way:
 *
 *   1. VERSION must change whenever index.html, styles.css or app.js changes.
 *      Old caches are thrown away when a new version activates.
 *
 *   2. The app shell is fetched network-first. Serving a cached index.html
 *      next to a freshly fetched app.js produces a half-old, half-new page
 *      that throws on startup and never renders. Correctness beats the few
 *      milliseconds cache-first would save.
 *
 * Pictures are still cache-first -- they do not go stale in a way that breaks
 * anything, and they are the heavy part.
 */

var VERSION = 'breslov-v9';

var SHELL = [
  '/', '/index.html', '/styles.css?v=9', '/app.js?v=9',
  '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-180.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === VERSION ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/** Save a copy for offline use, ignoring failures. */
function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return response;
  var copy = response.clone();
  caches.open(VERSION).then(function (c) { c.put(request, copy); }).catch(function () {});
  return response;
}

function isShell(url, request) {
  if (request.mode === 'navigate') return true;
  return /\.(?:html|css|js|webmanifest)$/.test(url.pathname) || url.pathname === '/';
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The learning and the app itself: always try the network first, so a new
  // deploy shows up straight away and the page is never a mix of versions.
  if (url.pathname.indexOf('/api/') === 0 || isShell(url, req)) {
    event.respondWith(
      fetch(req)
        .then(function (res) { return keep(req, res); })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            if (hit) return hit;
            if (req.mode === 'navigate') return caches.match('/index.html');
            return new Response(
              JSON.stringify({ available: false, reason: 'You are offline and this has not been saved yet.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Pictures and anything else: cache first, refreshed quietly in the background.
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) { return keep(req, res); }).catch(function () { return hit; });
      return hit || network;
    })
  );
});

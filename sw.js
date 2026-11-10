/* Keeps the app's own files on the phone so it opens without a connection. Your bible is not here: it is in the
   app's storage on the phone, put there by Load my bible. A new version of the app replaces these files. */
var CACHE = "story-bible-app-5";
var FILES = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "icon-180.png", "icon-192.png",
  "icon-512.png", "book-light.png", "book-dark.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // the newest app when online (kept for next time), the kept one when not
  e.respondWith(fetch(e.request).then(function (r) {
    if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match("index.html"); });
  }));
});

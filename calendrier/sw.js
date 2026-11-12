/* Mode hors ligne : les fichiers de l'application sont gardés sur l'appareil.
 * En ligne, on prend toujours la version la plus récente (et on la garde) ; hors ligne, la copie gardée.
 * Les données (événements, tâches) ne passent pas par ici : elles restent dans le stockage du navigateur. */
"use strict";
var CACHE = "calendrier-v3";
var FILES = [
  "./", "index.html", "manifest.webmanifest", "css/style.css", "assets/bg.jpg",
  "js/sync.js", "js/core.js", "js/ui.js", "js/gestures.js", "js/views.js", "js/side.js", "js/sheet.js", "js/ics.js", "js/voice.js", "js/main.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var mine = url.origin === self.location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mine && !fonts) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && (res.ok || res.type === "opaque")) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
    });
  }));
});

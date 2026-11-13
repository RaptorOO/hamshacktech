/* Hand-off period kill switch. Served at /cw-trainer/sw.js with status 200.
   Reloads the same hamshacktech URL so the hand-off page runs.
   Does not clear localStorage, IndexedDB, or caches.
   The direct morsecodeone.com jump is only for the later plain-301 cutover. */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map(function (client) {
      return client.navigate(client.url);
    }));
    await self.registration.unregister();
  })());
});

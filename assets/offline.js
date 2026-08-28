/* Registers the service worker that makes "Offline-ready" true.
 *
 * Kept separate from the pages so there is one registration, not eight copies
 * drifting apart. Silent by design: a browser without service-worker support,
 * or a user who has blocked it, simply gets the online-only app they had
 * before — nothing here should ever break a page that loads fine.
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  // file:// has no service-worker scope, and registering there throws.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  // Whether a worker was already in charge when this page started. A first
  // visit has none, and reloading there would be a pointless flash; an update
  // replacing an existing worker is the case worth reloading for.
  var hadController = !!navigator.serviceWorker.controller;
  var reloaded = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController || reloaded) return;
    reloaded = true;
    // The page on screen was built from what the old worker served. A new one
    // taking over means that content is out of date, and asking the reader to
    // refresh is asking them to know that.
    location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Registering checks for a new worker, but only on a load. A tab left
      // open all day would never look again, so ask on a timer as well.
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    }).catch(function () {});
  });

  // Exposed so a page can tell the reader what is actually available offline
  // rather than asserting it. Resolves false until the worker controls the
  // page — on a first visit it does not yet, so nothing is cached.
  window.LEAOffline = {
    ready: function () {
      return !!navigator.serviceWorker.controller;
    },
    cachedModuleCount: function () {
      if (!window.caches) return Promise.resolve(0);
      return caches.keys().then(function (keys) {
        var dataKey = keys.filter(function (k) { return k.indexOf('-data') !== -1; })[0];
        if (!dataKey) return 0;
        return caches.open(dataKey).then(function (c) {
          return c.keys().then(function (reqs) { return reqs.length; });
        });
      }).catch(function () { return 0; });
    }
  };
})();

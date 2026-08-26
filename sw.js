/* LEA Reviewer — offline support.
 *
 * Home has claimed "◎ Offline-ready — cached modules work without a
 * connection" for a while, and until this file existed that was simply false:
 * with no connection the site did not load at all. This makes the claim true,
 * and it is deliberately scoped to exactly what the claim says — the app
 * shell, plus the modules you have actually opened.
 *
 * STRATEGIES, and why each one
 * ----------------------------
 * - Page navigations: network-first, cache as fallback. A cached HTML page is
 *   the whole app, so serving a stale one would pin people to an old build
 *   after a deploy. Network wins whenever there is one.
 * - Same-origin static assets (assets/*.js, *.css, icons): cache-first. They
 *   carry a ?v= query, so a new version is a new URL and can never be stale.
 * - Question data (data/**, subjects/**): cache-first, refreshed in the
 *   background. This is what "cached modules work without a connection"
 *   means — a module you have opened stays openable.
 * - The Supabase library and Google Fonts: cache-first once fetched. Without
 *   the library cached, every page throws offline before it renders anything,
 *   so caching it is what makes the rest of this work at all.
 * - Supabase API calls: never cached. Progress reads/writes must hit the
 *   network or fail honestly, so module-progress.js can fall back to its
 *   local cache and queue the write. A cached API response would look like a
 *   successful sync that never happened.
 */
const VERSION = 'lea-v2';
const SHELL = VERSION + '-shell';
const DATA = VERSION + '-data';
const VENDOR = VERSION + '-vendor';

// The app shell. Everything here is small and needed before anything renders.
const SHELL_URLS = [
  'index.html',
  'subject.html',
  'run.html',
  'search.html',
  'saved.html',
  'standings.html',
  'onboarding.html',
  'welcome.html',
  'profile.html',
  'reminders.html',
  'assets/module-progress.js?v=2',
  'assets/quiz-source.js?v=2',
  'assets/avatar.js?v=5',
  'assets/quiz-resume.js?v=1',
  'assets/lea-confirm.js?v=1',
  'assets/theme.js?v=1',
  'assets/icons.js?v=1',
  'assets/countdown.js?v=1',
  'assets/blueprint.css?v=1',
  'assets/legacy-desktop.css?v=1',
  'data/subjects.json',
  'favicon.svg?v=5',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'apple-touch-icon.png',
  'site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // addAll fails the whole install if any single URL 404s, which would
      // leave the site with no worker at all. Add them individually so one
      // missing optional asset cannot take everything down.
      Promise.all(SHELL_URLS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf(VERSION) !== 0).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isQuestionData(url) {
  return url.pathname.indexOf('/data/') !== -1 || url.pathname.indexOf('/subjects/') !== -1;
}
function isVendor(url) {
  return url.hostname === 'cdn.jsdelivr.net' ||
         url.hostname === 'fonts.googleapis.com' ||
         url.hostname === 'fonts.gstatic.com';
}
function isSupabaseApi(url) {
  return url.hostname.indexOf('.supabase.co') !== -1;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) {
    // Refresh in the background so an edited question file lands next visit.
    fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
    }).catch(() => {});
    return hit;
  }
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // A navigation with nothing cached: hand back the shell's Home rather
    // than the browser's error page.
    if (request.mode === 'navigate') {
      const home = await cache.match('index.html');
      if (home) return home;
    }
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Progress and auth must never come from a cache — a stale "success" here
  // is a lie about the reader's own data.
  if (isSupabaseApi(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }
  if (isVendor(url)) {
    event.respondWith(cacheFirst(request, VENDOR));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isQuestionData(url)) {
    event.respondWith(cacheFirst(request, DATA));
    return;
  }
  event.respondWith(cacheFirst(request, SHELL));
});

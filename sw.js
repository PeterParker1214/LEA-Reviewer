/* LEA Reviewer Ã¢â‚¬â€ offline support.
 *
 * Home has claimed "Ã¢â€”Å½ Offline-ready Ã¢â‚¬â€ cached modules work without a
 * connection" for a while, and until this file existed that was simply false:
 * with no connection the site did not load at all. This makes the claim true,
 * and it is deliberately scoped to exactly what the claim says Ã¢â‚¬â€ the app
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
 *   means Ã¢â‚¬â€ a module you have opened stays openable.
 * - The Supabase library and Google Fonts: cache-first once fetched. Without
 *   the library cached, every page throws offline before it renders anything,
 *   so caching it is what makes the rest of this work at all.
 * - Supabase API calls: never cached. Progress reads/writes must hit the
 *   network or fail honestly, so module-progress.js can fall back to its
 *   local cache and queue the write. A cached API response would look like a
 *   successful sync that never happened.
 */
// Bumped whenever a cached thing changes meaning, not just when this file
// changes. activate deletes every cache not named for the current version, so
// a bump is what actually clears out what readers are already holding Ã¢â‚¬â€ and
// the last change (the subject list moving to network-first) shipped without
// one, which left the old copy sitting in the old cache on every device that
// had visited before.
const VERSION = 'lea-v107';
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
  'mnemonics.html',
  'codes.html',
  'standings.html',
  'onboarding.html',
  'welcome.html',
  'profile.html',
  'reminders.html',
  'notifications.html',
  'chat.html',
  'assets/chat.js?v=106',
  'assets/messenger-model.js?v=106',
  'assets/messenger.js?v=106',
  'assets/messenger.css?v=106',
  'duel.html',
  'user.html',
  'about.html',
  'assets/notifications.js?v=106',
  'assets/reminders.js?v=106',
  'assets/whats-new.js?v=106',
  'assets/module-progress.js?v=106',
  'assets/sb-client.js?v=106',
  'assets/quiz-source.js?v=106',
  'assets/quiz-pop.js?v=106',
  'assets/coffee.js?v=106',
  'assets/avatar.js?v=106',
  'assets/quiz-resume.js?v=106',
  'assets/lea-confirm.js?v=106',
  'assets/theme.js?v=106',
  'assets/icons.js?v=106',
  'assets/countdown.js?v=106',
  'assets/blueprint.css?v=106',
  'assets/leaderboard.css?v=106',
  'assets/leaderboard.js?v=106',
  'assets/legacy-desktop.css?v=106',
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
// data/subjects.json is the list of what exists, not a module's questions.
// Served cache-first like the rest of /data/, a subject or module added today
// stayed invisible until the visit after next Ã¢â‚¬â€ the cached copy was returned
// and the fresh one only put aside for later. It is a few kilobytes, so the
// network is always worth waiting for; the cache is the offline fallback.
function isManifest(url) {
  // changelog.json is how an open page learns a newer version exists, so a
  // cached copy would hide exactly the update it is meant to announce.
  return url.pathname.endsWith('/data/subjects.json') || url.pathname.endsWith('/data/changelog.json');
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

  // Progress and auth must never come from a cache Ã¢â‚¬â€ a stale "success" here
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
  if (isManifest(url)) {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }
  if (isQuestionData(url)) {
    event.respondWith(cacheFirst(request, DATA));
    return;
  }
  event.respondWith(cacheFirst(request, SHELL));
});

// ---- Phone/browser notifications (sent by the send-push edge function) ----
// Study and streak reminders carry a real question as their text, so the
// notification itself is the hook; tapping it opens that question on Home.
// Admin messages and report replies (?show=message / ?show=report) pass
// through untouched. Any failure falls back to the server's own text.
const trim = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
async function pushQuestion(data) {
  if (/show=(message|report)/.test(data.url || '')) return data;
  try {
    const subs = (await (await fetch('data/subjects.json')).json()).filter((x) => x.ready);
    const mods = []; let total = 0;
    subs.forEach((s) => (s.modules || []).forEach((m) => { if (m.total > 0) mods.push({ s, m, end: (total += m.total) }); }));
    for (let tries = 0; tries < 8 && total; tries++) {
      const r = Math.random() * total;
      const hit = mods.find((x) => r < x.end);
      let qs = await (await fetch(hit.m.file)).json();
      qs = Array.isArray(qs) ? qs : (qs && qs.questions) || [];
      const live = qs.map((q, i) => ({ t: String((q && (q.q || q.question)) || '').trim(), q, i }))
        .filter((x) => x.t.length >= 30 && !x.q.hidden && !x.q.scenario && !x.q.img);
      if (!live.length) continue;
      const x = live[Math.floor(Math.random() * live.length)];
      return Object.assign({}, data, {
        body: trim(x.t, 200),
        url: 'index.html?qs=' + encodeURIComponent(hit.s.id) + '&qm=' + encodeURIComponent(hit.m.id) + '&qi=' + x.i
      });
    }
  } catch (e) {}
  return data;
}
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(pushQuestion(data).then((d) => self.registration.showNotification(d.title || 'LEA Reviewer', {
    body: d.body || '',
    icon: 'apple-touch-icon.png',
    badge: 'favicon-32x32.png',
    data: { url: d.url || 'notifications.html' }
  })));
});

// Tapping a notification focuses an open LEA tab, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || 'notifications.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => w.url.indexOf(self.registration.scope) === 0);
    if (open) return open.navigate(target).then((w) => (w || open).focus());
    return self.clients.openWindow(target);
  }));
});

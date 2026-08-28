// The service worker decided data/subjects.json was module content and served
// it from cache, so a subject or module added today only appeared on the visit
// after next.
//
// This drives the worker's real fetch listener and watches the order of calls:
// network-first asks the network before the cache, cache-first asks the cache
// before the network. Nothing here re-states the routing rules, so the test
// still means something if they change.
const fs = require('fs');
const vm = require('vm');

const listeners = {};
let calls = [];

const ctx = {
  self: {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    location: { origin: 'https://peterparker1214.github.io' },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  },
  caches: {
    open: async () => ({
      match: async () => { calls.push('cache'); return null; },
      put: async () => {},
    }),
    keys: async () => [],
  },
  fetch: async () => { calls.push('network'); return { ok: true, clone: () => ({}) }; },
  URL, Request, console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('sw.js', 'utf8'), ctx);
if (!listeners.fetch) throw new Error('sw.js registered no fetch listener');

async function strategyFor(url, mode = 'cors') {
  calls = [];
  let responded = null;
  listeners.fetch({
    request: { method: 'GET', url, mode },
    respondWith: (p) => { responded = p; },
  });
  if (!responded) return 'not-handled';
  try { await responded; } catch (e) { /* the order is what matters */ }
  if (!calls.length) return 'not-handled';
  return calls[0] === 'network' ? 'network-first' : 'cache-first';
}

const cases = [
  ['https://peterparker1214.github.io/LEA-Reviewer/data/subjects.json', 'network-first', 'the subject list'],
  ['https://peterparker1214.github.io/data/subjects.json', 'network-first', 'the subject list served from the root'],
  ['https://peterparker1214.github.io/LEA-Reviewer/data/theory/05.json', 'cache-first', 'a module still works offline'],
  ['https://peterparker1214.github.io/LEA-Reviewer/subjects/x/quizzes/y.html', 'cache-first', 'an html quiz still works offline'],
  ['https://peterparker1214.github.io/LEA-Reviewer/assets/theme.js?v=1', 'cache-first', 'a versioned asset'],
];

(async () => {
  let bad = 0;
  for (const [url, want, label] of cases) {
    const got = await strategyFor(url);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} → ${got}${ok ? '' : '  (wanted ' + want + ')'}`);
  }
  const supa = await strategyFor('https://rjrrprbvsmflzncojbtq.supabase.co/rest/v1/progress');
  const supaOk = supa === 'not-handled';
  if (!supaOk) bad++;
  console.log(`  ${supaOk ? 'PASS' : 'FAIL'}  progress calls stay off the worker → ${supa}`);

  console.log(bad ? `\n${bad} FAILED\n` : '\nall passed\n');
  process.exit(bad ? 1 : 0);
})();

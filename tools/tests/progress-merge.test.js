// Progress is one JSON row per reader. Each open page used to write back its
// whole copy of that row, so a laptop left open all day overwrote whatever the
// phone had saved since the laptop loaded: the streak, the mock-exam history,
// and any module the laptop had not touched.
//
// Two copies of the real assets/module-progress.js run here as two devices on
// one shared row. Each saves something different; both must survive.
const fs = require('fs');
const vm = require('vm');

const row = { data: { 'history-of-architecture': { '01': { mastered: [0], bestCorrect: 1, bestTotal: 5, attempts: 1 } } } };
const clone = (x) => JSON.parse(JSON.stringify(x));

function fakeClient() {
  const q = {
    select() { return q; }, eq() { return q; },
    maybeSingle: async () => ({ data: { data: clone(row.data) }, error: null }),
    upsert: async (r) => { row.data = clone(r.data); return { error: null }; },
    insert: async () => ({ error: null }),
  };
  return {
    from: () => q,
    auth: {
      onAuthStateChange() {},
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    },
  };
}

function device() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i],
    get length() { return Object.keys(store).length; },
  };
  const client = fakeClient();
  const ctx = {
    localStorage, console, setTimeout, clearTimeout, Promise, JSON, Object, Array, Set, Math, Date,
    document: { addEventListener() {}, querySelector: () => null },
  };
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  ctx.window.supabase = { createClient: () => client };
  ctx.window.leaClient = () => client;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('assets/module-progress.js', 'utf8'), ctx);
  return ctx.window.LEAProgress;
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const laptop = device();
  const phone = device();
  await tick(20); // both have read the row

  phone.markMastered('structural', '03', 7);
  phone.saveMeta('streak', { current: 5, lastCompletedDate: '2026-09-23' });
  await tick(700); // phone's debounced write lands

  laptop.markMastered('history-of-architecture', '01', 4); // laptop still holds the morning's row
  await tick(700);

  const d = row.data;
  const fail = [];
  if (!d.structural || !d.structural['03'] || d.structural['03'].mastered.indexOf(7) === -1) fail.push('phone mastery was overwritten');
  if (!d.streak || d.streak.current !== 5) fail.push('phone streak was overwritten');
  const h = d['history-of-architecture']['01'].mastered;
  if (h.indexOf(0) === -1 || h.indexOf(4) === -1) fail.push('laptop mastery merged wrong: ' + JSON.stringify(h));

  laptop.reset('structural', '03');
  await tick(700);
  if (row.data.structural && row.data.structural['03']) fail.push('reset did not stick');

  if (fail.length) { console.error('FAIL\n  ' + fail.join('\n  ')); process.exit(1); }
  console.log('ok — two devices saved different things and both survived; reset still sticks');
})();

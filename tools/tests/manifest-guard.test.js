// Replays the real data loss out of this repo's git history against the new
// guard. d1076cf's manifest is what the site had; 3c51203's is the older copy
// raw.githubusercontent.com was still handing back. Appending to the older one
// and writing it is exactly how "theory-of-architecture-and-planning|...-19"
// was deleted while the page said the save succeeded.
const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

const src = fs.readFileSync('admin.html', 'utf8');
const start = src.indexOf('function parseManifestText(text){');
const end = src.indexOf('async function loadManifest(){');
if (start < 0 || end < 0 || end <= start) throw new Error('could not slice the guard out of admin.html');
const guard = src.slice(start, end);

function manifestAt(sha) {
  return JSON.parse(execSync(`git show ${sha}:data/subjects.json`, { encoding: 'utf8', maxBuffer: 1 << 26 }));
}
const SITE_HAS = manifestAt('d1076cf');     // the site, with the -19 module on it
const CDN_GAVE = manifestAt('d1076cf~1');   // the copy the CDN kept serving, without it

let store = {};
const ctx = {
  GITHUB_OWNER: 'o', GITHUB_REPO: 'r', GITHUB_BRANCH: 'main',
  MANIFEST_PATH: 'data/subjects.json',
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  setTimeout: (fn) => fn(),          // no real waiting in the test
  console,
  fetch: null,                       // set per test
};
vm.createContext(ctx);
// `const` at the top level of a vm script does not land on the context
// object, so hand the pieces back explicitly.
const api = vm.runInContext(
  guard + ';({ fetchManifestForWrite, manifestKeys, missingFromManifest, rememberManifest, noteManifestSeen, removedModuleKeys })',
  ctx);
Object.assign(ctx, api);

function serve(...queue) {
  let i = 0;
  ctx.fetch = async () => {
    const body = queue[Math.min(i++, queue.length - 1)];
    return { ok: true, text: async () => JSON.stringify(body) };
  };
}

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); }
  catch (e) { failures++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  console.log('\nkeys the site had: ' + ctx.manifestKeys(SITE_HAS).length +
              ' | keys the stale read offered: ' + ctx.manifestKeys(CDN_GAVE).length + '\n');

  // What the code used to do, on the same two manifests: read whatever came
  // back, append, write it. Kept as the record of the bug being fixed.
  await check('the old read-append-write really did drop a module', async () => {
    const appended = JSON.parse(JSON.stringify(CDN_GAVE));
    appended.find(s => s.id === 'theory-of-architecture-and-planning').modules.push(
      { id: 'theory-of-architecture-and-planning-30', no: '30', title: 'ORIGINAL PREBOARD',
        total: 200, file: 'data/theory-of-architecture-and-planning/30.json', format: 'json' });
    const after = new Set(ctx.manifestKeys(appended));
    assert(!after.has('theory-of-architecture-and-planning|theory-of-architecture-and-planning-19'),
      'the premise of this whole fix is wrong');
    assert(ctx.manifestKeys(SITE_HAS).every(k => k === 'theory-of-architecture-and-planning|theory-of-architecture-and-planning-19' || after.has(k)),
      'more than the one module differs — the pair is not the right one to reason from');
  });

  await check('the stale read is refused instead of returned', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    serve(CDN_GAVE);
    let threw = null;
    try { await ctx.fetchManifestForWrite(); } catch (e) { threw = e; }
    assert(threw, 'it returned the stale manifest — the module would have been deleted');
    assert(/out-of-date/.test(threw.message), 'wrong error: ' + threw.message);
    assert(/Nothing was written/.test(threw.message), 'error does not say nothing was written');
  });

  await check('names the module that would have been lost', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    serve(CDN_GAVE);
    const missing = ctx.missingFromManifest(CDN_GAVE);
    assert(missing.length === 1, 'expected exactly one, got: ' + JSON.stringify(missing));
    assert(missing[0] === 'theory-of-architecture-and-planning|theory-of-architecture-and-planning-19',
      'expected the -19 module in the missing list, got: ' + JSON.stringify(missing));
  });

  await check('a manifest that has caught up is accepted', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    serve(SITE_HAS);
    const got = await ctx.fetchManifestForWrite();
    assert(ctx.manifestKeys(got).length === ctx.manifestKeys(SITE_HAS).length, 'wrong manifest returned');
  });

  await check('retries, and takes the fresh copy when it arrives', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    const logged = [];
    serve(CDN_GAVE, CDN_GAVE, SITE_HAS);
    const got = await ctx.fetchManifestForWrite(m => logged.push(m));
    assert(ctx.manifestKeys(got).length === ctx.manifestKeys(SITE_HAS).length, 'did not end on the fresh copy');
    assert(logged.length === 2, 'expected two waiting messages, got ' + logged.length);
    assert(/still catching up/.test(logged[0]), 'unhelpful wait message: ' + logged[0]);
  });

  await check('a module removed on purpose does not trip the guard', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    ctx.missingFromManifest(CDN_GAVE).forEach(k => ctx.removedModuleKeys.add(k));
    serve(CDN_GAVE);
    const got = await ctx.fetchManifestForWrite();
    assert(Array.isArray(got), 'a deliberate removal was blocked');
  });

  await check('an ordinary read cannot shrink what is remembered', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    ctx.noteManifestSeen(CDN_GAVE);        // the stale copy comes back on a plain load
    serve(CDN_GAVE);
    let threw = null;
    try { await ctx.fetchManifestForWrite(); } catch (e) { threw = e; }
    assert(threw, 'a stale read disarmed the guard by being remembered');
  });

  await check('the reload button does replace what is remembered', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    ctx.rememberManifest(SITE_HAS);
    ctx.rememberManifest(CDN_GAVE);        // what "Reload from GitHub" does
    serve(CDN_GAVE);
    const got = await ctx.fetchManifestForWrite();
    assert(Array.isArray(got), 'the way out of a stuck guard is blocked');
  });

  await check('a first-ever run with nothing remembered still works', async () => {
    store = {}; ctx.removedModuleKeys.clear();
    serve(CDN_GAVE);
    const got = await ctx.fetchManifestForWrite();
    assert(Array.isArray(got), 'blocked with an empty watermark');
  });

  console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall passed\n');
  process.exit(failures ? 1 : 0);
})();

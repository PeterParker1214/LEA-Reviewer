# Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin panel's overflowing six-tab strip with one list of five sections that renders as a bottom bar on a phone and a sidebar on a laptop, and rebuild the Deleted tab around module names instead of file paths.

**Architecture:** All navigation state comes from a single `SECTIONS` array in `admin.html`'s first inline script block. The bottom bar, the sidebar and `showSection(id)` all read it, so the two placements cannot drift. Each section keeps the lazy-load behaviour it has today, expressed as `render` + `once` fields on its entry. Everything else in the panel is untouched except the Deleted tab, which is rebuilt onto the shared card shape.

**Tech Stack:** Static HTML/CSS/vanilla JS. No build step, no framework. Tests are plain `node` scripts under `tools/tests/`; the shell tests additionally need `jsdom`.

**Spec:** `docs/superpowers/specs/2026-09-04-admin-shell-design.md`

## Global Constraints

- **Never renumber or reorder questions, module `id`s or module `no`s.** `mastered[]`, `flagged[]`, `notes{}` and `reports.question_ref` are keyed by `subject/module/index`.
- **`admin.html` has two inline `<script>` blocks**, and block 1 contains template literals holding the literal text `<script>`. When splitting the file programmatically, split on whole lines, never on substrings.
- **`admin.html` is not in `sw.js`'s precache list**, so no `VERSION` bump is needed for changes to it. Changing `assets/icons.js` *does* require bumping its `?v=` query in every page that loads it.
- **The manifest is fetched once and written once per save pass.** No task here touches a save path; if one appears to, stop.
- **Wording rule:** say what a control does to *the site*, not what it does to *the repository*. No file paths in headline positions.
- **Touch targets:** no interactive control under 32px high below 720px viewport width.
- Existing suites `tools/tests/manifest-guard.test.js`, `tools/tests/sw-routing.test.js` and `tools/tests/module-order.test.js` must pass after every task.

---

### Task 1: Bring the jsdom harness into the repo

The Subjects-tab rebuild was tested with a jsdom harness that currently lives outside the repo, so it is lost on cleanup. Every later task in this plan needs it. `tools/tests/` is otherwise dependency-free, so this task also records that these particular tests need one install.

**Files:**
- Create: `tools/tests/lib/admin-dom.js`
- Create: `tools/tests/subjects-tab.test.js`
- Modify: `tools/tests/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `require('./lib/admin-dom.js')` exporting `boot(adminPath)` → `{ dom, window, ctx, api }`, where `api` has `setSubjects(array)`, getters `subjects` / `manifestSubjects`, and live references `renderSubjectsTab`, `manifestToJson`, `openSubjects`, `removedModuleKeys`, `pendingModuleArchives`. Also exports `scriptBlocks(text)` → array of two strings. Later tasks extend `api` by adding names to the returned object literal inside `boot`.

- [ ] **Step 1: Create the harness**

`tools/tests/lib/admin-dom.js`:

```js
// Boots admin.html inside jsdom so the panel's own code can be driven from a
// test. HANDOFF.md: create the DOM, then run both inline script blocks with
// vm.runInContext against dom.getInternalVMContext() — a plain window.eval
// does not put the declarations on window.
//
// These tests are the only ones in tools/tests that need a dependency.
// Install it once with:  npm install jsdom
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

// Block 1 holds template literals containing the literal text "<script>", so
// split on whole lines, never on substrings.
function scriptBlocks(text) {
  const out = [];
  let inside = false, buf = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!inside && t === '<script>') { inside = true; buf = []; continue; }
    if (inside && t === '</script>') { inside = false; out.push(buf.join('\n')); continue; }
    if (inside) buf.push(line);
  }
  return out;
}

function boot(adminPath) {
  const src = fs.readFileSync(adminPath || 'admin.html', 'utf8');
  const blocks = scriptBlocks(src);
  if (blocks.length !== 2) throw new Error('expected 2 inline script blocks, found ' + blocks.length);

  // The panel's own <body>, so the code finds the ids it expects.
  const bodyMatch = src.slice(src.indexOf('<body>'), src.indexOf('<script>', src.indexOf('<body>')));
  const dom = new JSDOM('<!doctype html><html><body>' + bodyMatch.replace('<body>', '') + '</body></html>',
    { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
  const ctx = dom.getInternalVMContext();
  const w = dom.window;

  const noop = () => {};
  w.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: noop },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
  }) };
  w.LEAQuizSource = { load: async () => ({ questions: [] }) };
  w.LEAQuizRework = {};
  w.LEADocxQuiz = {};
  w.LEAImageIntake = { attach: noop, readable: () => '0 KB' };
  w.LEAIcons = new Proxy({}, { get: () => (() => '<svg></svg>') });
  w.LEATheme = { init: noop };
  w.LEAConfirm = async () => true;
  w.LEAAlert = async () => {};
  w.LEAPrompt = async () => 'New Subject';
  w.fetch = async () => { throw new Error('no network in this test'); };
  w.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
  w.Element.prototype.scrollIntoView = noop;

  for (const b of blocks) vm.runInContext(b, ctx);

  // let/const at the top level of a vm script do not land on the context
  // object, so reach back in for the bindings tests drive.
  const api = vm.runInContext(`({
    setSubjects(a){ subjects = a; manifestSubjects = a; },
    get subjects(){ return subjects; },
    get manifestSubjects(){ return manifestSubjects; },
    renderSubjectsTab, manifestToJson, openSubjects,
    removedModuleKeys, pendingModuleArchives
  })`, ctx);

  return { dom, window: w, ctx, api };
}

module.exports = { boot, scriptBlocks };
```

- [ ] **Step 2: Add the Subjects-tab test**

`tools/tests/subjects-tab.test.js` — the 14 cases already written and passing. Copy them verbatim from the working version, replacing its inline `boot`/`scriptBlocks`/stub block with:

```js
const { boot } = require('./lib/admin-dom.js');
```

and its `makeSubjects()` fixture unchanged. Keep the queued async runner:

```js
let failures = 0;
const queued = [];
function check(name, fn) { queued.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of queued) {
    try { await fn(); console.log('  PASS  ' + name); }
    catch (e) { failures++; console.log('  FAIL  ' + name + '\n        ' + ((e && e.message) || e)); }
  }
}
```

Half these cases await a confirmation dialog; a synchronous runner reports PASS before such a body has rejected.

- [ ] **Step 3: Run it**

Run: `npm install jsdom && node tools/tests/subjects-tab.test.js`
Expected: `all passing`, 14 cases.

- [ ] **Step 4: Prove it is not vacuous**

The Subjects rebuild is already committed, so stashing reverts nothing. Take the
pre-rebuild copy out of history instead and point `boot()` at it — that is why
it takes a path:

```bash
git show main:admin.html > /tmp/admin.before.html
node tools/tests/subjects-tab.test.js /tmp/admin.before.html
```

Expected: **all 14 fail**, with `openSubjects is not defined`. If any pass, the
harness is not loading the file it was handed and every later task's test is
worthless.

This requires `subjects-tab.test.js` to honour `process.argv[2]`:

```js
const ADMIN = process.argv[2] || 'admin.html';
// …and every scene() call passes it: boot(ADMIN)
```

- [ ] **Step 5: Document the dependency**

Append to `tools/tests/README.md`:

```markdown
`subjects-tab.test.js` and `admin-shell.test.js` drive `admin.html` inside a
real DOM, so they need one dependency the other tests do not:

    npm install jsdom
    node tools/tests/subjects-tab.test.js
    node tools/tests/admin-shell.test.js

They boot the page through `lib/admin-dom.js`, which runs both inline script
blocks against a jsdom context and hands back the panel's own bindings.
```

- [ ] **Step 6: Run every suite**

Run: `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done`
Expected: all four suites pass.

- [ ] **Step 7: Commit**

```bash
git add tools/tests/lib/admin-dom.js tools/tests/subjects-tab.test.js tools/tests/README.md
git commit -m "Bring the admin.html jsdom harness into the repo"
```

---

### Task 2: Delete the Add Module tab

Isolated and reviewable on its own. `HANDOFF.md` already claims this was done; it was not.

**Files:**
- Modify: `admin.html` (tab button ~line 344, `#tab-upload` div ~line 350, `tabUploadEl` const ~line 376, the `upload` toggle+render lines ~753/758, and `renderUploadTab` with its helpers ~line 2235 onward)

**Interfaces:**
- Consumes: nothing.
- Produces: a panel with five tabs. `renderUploadTab`, `tabUploadEl` and `#tab-upload` no longer exist; no later task may reference them.

- [ ] **Step 1: Find every reference**

Run: `grep -n "upload\|Upload" admin.html`

Record the full list before deleting. Expect: the tab button, the `#tab-upload` div, `const tabUploadEl`, two lines inside the tab-click handler, `renderUploadTab` itself, and the drop-zone/`uploadSubjectSelect`/`newSubjectFields` handlers that only `renderUploadTab` creates.

- [ ] **Step 2: Confirm what must NOT be deleted**

Run: `grep -n "LEAImageIntake" admin.html`

Expected: hits inside `renderQuestionsList` (~line 1865) only. `assets/image-intake.js` is used by the **question editor** for pasting pictures into a question, not by Add Module. Leave its `<script>` tag at line 20 alone.

Run: `grep -n "nextModuleNo\|fillInKnownTitles\|peekUnlistedFile" admin.html`

Expected: hits from the Subjects tab's unlisted-file scanner and the Deleted tab too. These are shared — do not delete them with the upload tab.

- [ ] **Step 3: Delete**

Remove, in this order:
1. `<button class="tab-btn" data-tab="upload">Add Module</button>`
2. `<div id="tab-upload" class="hidden"></div>`
3. `const tabUploadEl = document.getElementById('tab-upload');`
4. `tabUploadEl.classList.toggle('hidden', btn.dataset.tab !== 'upload');`
5. `if(btn.dataset.tab === 'upload') renderUploadTab();`
6. `function renderUploadTab(){ … }` and any function called from nowhere else once it is gone.

- [ ] **Step 4: Verify nothing dangles**

Run: `grep -n "tabUploadEl\|renderUploadTab\|tab-upload" admin.html`
Expected: no output.

Run: `node -e "const fs=require('fs');const {scriptBlocks}=require('./tools/tests/lib/admin-dom.js');scriptBlocks(fs.readFileSync('admin.html','utf8')).forEach((b,i)=>{try{new Function(b);console.log('block '+(i+1)+' parses')}catch(e){console.log('block '+(i+1)+' SYNTAX: '+e.message)}})"`
Expected: `block 1 parses`, `block 2 parses`.

- [ ] **Step 5: Run every suite**

Run: `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done`
Expected: all pass. `subjects-tab.test.js` boots the whole file, so a dangling reference surfaces here.

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "Delete the Add Module tab

It accepted only self-contained HTML quiz files — the format the
conversion to JSON modules removed and archived. Rework Module already
takes .docx/.html/.json and writes the format the site reads, so this
was the last route that put the old one back.

assets/image-intake.js stays: it belongs to the question editor, not
to this tab."
```

---

### Task 3: Add the five navigation icons

Must land before the nav renders, because the nav calls them.

**Files:**
- Modify: `assets/icons.js:24-63` (add to the returned object)
- Modify: `admin.html:18` (bump `?v=16` → `?v=17`)
- Modify: every other page loading `assets/icons.js` (bump the same `?v=`)

**Interfaces:**
- Consumes: `wrap(size, body, extra)`, already defined at `assets/icons.js:17`.
- Produces: `LEAIcons.grid(s)`, `LEAIcons.pencil(s)`, `LEAIcons.plus(s)`, `LEAIcons.undo(s)`, `LEAIcons.flag(s)` — each takes an optional pixel size (default 18) and returns an SVG string using `currentColor`.

- [ ] **Step 1: Find every page that loads the icon set**

Run: `grep -rn "icons.js" --include=*.html .`

Every hit's `?v=` must move together, or some pages get the new file and others a cached old one.

- [ ] **Step 2: Add the icons**

Insert into the returned object in `assets/icons.js`, before the closing `};`, keeping the file's existing Lucide-geometry / stroke-width-1.5 style:

```js
    grid: function (s) {
      return wrap(s || 18,
        '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
        '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
        '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
        '<rect x="14" y="14" width="7" height="7" rx="1"/>');
    },
    pencil: function (s) {
      return wrap(s || 18,
        '<path d="M21.17 6.83a2.83 2.83 0 0 0-4-4L3 17v4h4Z"/>' +
        '<path d="m15 5 4 4"/>');
    },
    plus: function (s) {
      return wrap(s || 18, '<path d="M12 5v14"/><path d="M5 12h14"/>');
    },
    undo: function (s) {
      return wrap(s || 18,
        '<path d="M3 7v6h6"/>' +
        '<path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7"/>');
    },
    flag: function (s) {
      return wrap(s || 18,
        '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z"/>' +
        '<path d="M4 22v-7"/>');
    }
```

Note the existing last entry `power` needs a trailing comma added.

- [ ] **Step 3: Verify they parse and render**

Run:

```bash
node -e "global.window={};require('./assets/icons.js');const i=window.LEAIcons;
['grid','pencil','plus','undo','flag'].forEach(n=>{
  const s=i[n](20);
  if(!/^<svg /.test(s)) throw new Error(n+' did not return an svg');
  if(!/currentColor/.test(s)) throw new Error(n+' does not use currentColor');
  if(!/width=\"20\"/.test(s)) throw new Error(n+' ignored its size argument');
  console.log('  PASS  '+n);
});"
```

Expected: five PASS lines.

- [ ] **Step 4: Bump the cache-busting query everywhere**

Change `icons.js?v=16` to `icons.js?v=17` in every file found in Step 1.

Run: `grep -rn "icons.js?v=" --include=*.html . | grep -v "v=17"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add assets/icons.js *.html
git commit -m "Add five navigation icons to the shared icon set"
```

---

### Task 4: One section list and one switcher

The heart of the change. Replaces six hard-coded toggles with one list, and renders both nav placements from it.

**Files:**
- Modify: `admin.html:341-352` (the `.tabs` markup and section divs)
- Modify: `admin.html:~747-765` (the tab click handler)
- Modify: `admin.html:~2855` (the programmatic jump)
- Create: `tools/tests/admin-shell.test.js`

**Interfaces:**
- Consumes: `LEAIcons.grid/pencil/plus/undo/flag` from Task 3; `boot()` from Task 1.
- Produces:
  - `SECTIONS` — array of `{ id, label, short?, icon, render, once }`, in display order.
  - `showSection(id)` — hides every `#tab-*` panel, shows the one named, marks the nav item current, and runs that section's `render` (respecting `once`). Safe to call from code as well as from a tap.
  - `renderNav()` — writes the nav markup into `#nav` from `SECTIONS`.
  - `currentSectionId` — the id currently shown.
  - The harness `api` gains `SECTIONS`, `showSection`, `renderNav`, `get currentSectionId()`.

- [ ] **Step 1: Write the failing test**

`tools/tests/admin-shell.test.js`:

```js
// The shell: one list of sections, two places it is drawn, one switcher.
const { boot } = require('./lib/admin-dom.js');

let failures = 0;
const queued = [];
function check(name, fn) { queued.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of queued) {
    try { await fn(); console.log('  PASS  ' + name); }
    catch (e) { failures++; console.log('  FAIL  ' + name + '\n        ' + ((e && e.message) || e)); }
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

function scene() {
  const { window: w, api } = boot('admin.html');
  api.setSubjects([{ id: 'building-laws', name: 'Building Laws', ready: true, modules: [] }]);
  api.renderNav();
  return { w, api, doc: w.document };
}

console.log('\nAdmin shell\n');

check('there are five sections, in order, and Add Module is not one of them', () => {
  const { api } = scene();
  assert(api.SECTIONS.map(s => s.id).join() === 'subjects,pages,rework,deleted,reports',
    'wrong sections: ' + api.SECTIONS.map(s => s.id).join());
  assert(!api.SECTIONS.some(s => s.id === 'upload'), 'Add Module is still in the list');
});

check('the phone bar and the sidebar draw the same ids in the same order', () => {
  const { doc } = scene();
  const ids = sel => [...doc.querySelectorAll(sel)].map(el => el.dataset.section).join();
  const bar = ids('#navBar [data-section]');
  const side = ids('#navSide [data-section]');
  assert(bar.length, 'the bottom bar rendered nothing');
  assert(bar === side, 'bar and sidebar disagree:\n  bar:  ' + bar + '\n  side: ' + side);
});

check('showSection leaves exactly one section panel visible', () => {
  const { w, api, doc } = scene();
  api.showSection('deleted');
  const shown = api.SECTIONS.filter(s => !doc.getElementById('tab-' + s.id).classList.contains('hidden'));
  assert(shown.length === 1, shown.length + ' panels visible, expected 1');
  assert(shown[0].id === 'deleted', 'showed ' + shown[0].id);
  assert(api.currentSectionId === 'deleted', 'currentSectionId not updated');
});

check('both nav placements mark the same item current', () => {
  const { api, doc } = scene();
  api.showSection('reports');
  const on = [...doc.querySelectorAll('[data-section].on')].map(el => el.dataset.section);
  assert(on.length === 2, 'expected the item marked in both placements, got ' + on.length);
  assert(on.every(id => id === 'reports'), 'marked ' + on.join());
});

check('a "once" section renders on first open only', () => {
  const { api } = scene();
  let runs = 0;
  const pages = api.SECTIONS.find(s => s.id === 'pages');
  assert(pages.once === true, 'pages should be a once-only section');
  pages.render = () => { runs++; };
  api.showSection('pages');
  api.showSection('subjects');
  api.showSection('pages');
  assert(runs === 1, 'render ran ' + runs + ' times, expected 1');
});

check('an every-open section renders every time', () => {
  const { api } = scene();
  let runs = 0;
  const deleted = api.SECTIONS.find(s => s.id === 'deleted');
  assert(deleted.once === false, 'deleted should re-render on every open');
  deleted.render = () => { runs++; };
  api.showSection('deleted');
  api.showSection('subjects');
  api.showSection('deleted');
  assert(runs === 2, 'render ran ' + runs + ' times, expected 2');
});

check('tapping a nav item switches section', () => {
  const { api, doc } = scene();
  doc.querySelector('#navBar [data-section="rework"]').click();
  assert(api.currentSectionId === 'rework', 'tap did not switch, at ' + api.currentSectionId);
});

check('the old tab-btn markup is gone', () => {
  const { doc } = scene();
  assert(!doc.querySelector('.tab-btn'), '.tab-btn still exists — the code that jumps to Pages relies on it');
});

check('walking every section leaves the manifest byte-identical', () => {
  const { api } = scene();
  api.renderSubjectsTab();
  const before = api.manifestToJson(api.subjects);
  api.SECTIONS.forEach(s => { s.render = () => {}; });
  api.SECTIONS.forEach(s => api.showSection(s.id));
  api.SECTIONS.slice().reverse().forEach(s => api.showSection(s.id));
  assert(api.manifestToJson(api.subjects) === before,
    'moving between sections changed what would be written to the site');
});

runAll().then(() => {
  console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
  process.exitCode = failures ? 1 : 0;
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/tests/admin-shell.test.js`
Expected: FAIL on every case — `api.SECTIONS is undefined`, because `boot`'s `api` object does not export it yet and the code does not exist.

- [ ] **Step 3: Replace the markup**

In `admin.html`, replace the `.tabs` block and the six section divs with:

```html
    <nav id="nav"></nav>
    <div id="sections">
      <div id="tab-subjects"></div>
      <div id="tab-pages" class="hidden"></div>
      <div id="tab-rework" class="hidden"></div>
      <div id="tab-deleted" class="hidden"></div>
      <div id="tab-reports" class="hidden"></div>
    </div>
```

- [ ] **Step 4: Add the list and the switcher**

In script block 1, near the other top-level declarations:

```js
/* ---- The five sections -------------------------------------------------
 * Written once. The bottom bar, the sidebar and showSection() all read this,
 * so the phone and the laptop cannot disagree about what exists or what it
 * is called. Renaming a section is one edit here; so is removing one.
 *
 * `once: true` means the section's render runs the first time it is opened
 * and not again — the file tree is expensive and does not change under us.
 * `once: false` re-renders on every open, which is what these tabs did when
 * each had its own line in the click handler.
 */
const SECTIONS = [
  { id:'subjects', label:'Subjects',   icon:'grid',   once:false, render:() => renderSubjectsTab() },
  { id:'pages',    label:'Questions',  icon:'pencil', once:true,  render:() => loadFileTree() },
  { id:'rework',   label:'New module', short:'New',
                   icon:'plus',   once:false, render:() => renderReworkTab() },
  { id:'deleted',  label:'Deleted',    icon:'undo',   once:false, render:() => scanDeletedModules() },
  { id:'reports',  label:'Reports',    icon:'flag',   once:false, render:() => openReportsTab() },
];

let currentSectionId = 'subjects';
const sectionsRendered = new Set();

function navItemsHtml(placement){
  return SECTIONS.map(s => {
    const text = placement === 'bar' ? (s.short || s.label) : s.label;
    return '<button class="nav-item' + (s.id === currentSectionId ? ' on' : '') + '"' +
      ' data-section="' + s.id + '">' +
      '<span class="nav-ico">' + LEAIcons[s.icon](20) + '</span>' +
      '<span class="nav-label">' + escapeHtml(text) + '</span>' +
      '</button>';
  }).join('');
}

function renderNav(){
  document.getElementById('nav').innerHTML =
    '<div id="navSide" class="nav-side">' +
      '<div class="nav-brand"><h1>Admin</h1><div class="sub">LEA Reviewer</div></div>' +
      navItemsHtml('side') +
    '</div>' +
    '<div id="navBar" class="nav-bar">' + navItemsHtml('bar') + '</div>';

  document.querySelectorAll('#nav [data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
}

// Called from a tap and from code alike — "open this question" in a report
// comes through here too, so it must always run the section's render.
function showSection(id){
  const section = SECTIONS.find(s => s.id === id);
  if(!section) return;
  currentSectionId = id;
  SECTIONS.forEach(s => {
    document.getElementById('tab-' + s.id).classList.toggle('hidden', s.id !== id);
  });
  renderNav();
  if(section.once && sectionsRendered.has(id)) return;
  sectionsRendered.add(id);
  section.render();
}
```

- [ ] **Step 5: Delete the old handler and call the new one**

Remove the whole `document.querySelectorAll('.tab-btn').forEach(...)` block. In its place, before `await loadSubjects();`:

```js
  renderNav();
```

`loadSubjects()` still renders the Subjects tab directly, so the opening screen is unchanged.

- [ ] **Step 6: Fix the programmatic jump**

At `admin.html:~2855`, replace:

```js
  document.querySelector('.tab-btn[data-tab="pages"]').click();
```

with:

```js
  showSection('pages');
```

Leave the `if(fileTree.length === 0)` guard that follows it exactly as it is — `showSection` runs `loadFileTree` on first open, and the guard covers the second visit.

- [ ] **Step 7: Export the new bindings to the harness**

In `tools/tests/lib/admin-dom.js`, add to the object literal inside `vm.runInContext`:

```js
    SECTIONS, showSection, renderNav,
    get currentSectionId(){ return currentSectionId; },
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node tools/tests/admin-shell.test.js`
Expected: `all passing`, 9 cases.

- [ ] **Step 9: Run every suite**

Run: `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done`
Expected: all five suites pass.

- [ ] **Step 10: Commit**

```bash
git add admin.html tools/tests/
git commit -m "Drive the admin nav from one list of sections

The six classList.toggle lines became showSection(id), and the tab
strip markup became a nav rendered from SECTIONS. The bottom bar and
the sidebar read the same array, so they cannot drift.

The jump from a report into the question editor called .tab-btn.click();
with the strip gone that selector returns null, so it now calls
showSection('pages') — which is why showSection has to run a section's
render whether it was reached by tap or by code."
```

---

### Task 5: Place the nav — bottom bar on a phone, sidebar on a laptop

Pure CSS plus removing the old page title. No JS changes.

**Files:**
- Modify: `admin.html:44-58` (body, `.wrap`, `h1`, `.sub`, `.tabs`, `.tab-btn` rules)
- Modify: `admin.html:~335` (the `<h1>Admin</h1>` / `<div class="sub">` now living in the sidebar)

**Interfaces:**
- Consumes: `#nav`, `#navSide`, `#navBar`, `.nav-item`, `.nav-ico`, `.nav-label`, `.nav-brand` from Task 4.
- Produces: no new JS.

- [ ] **Step 1: Remove the old page title**

Task 4's `renderNav()` already writes `<h1>Admin</h1>` and `<div class="sub">LEA Reviewer</div>` into `.nav-brand`. Delete the originals from the `.wrap` so they are not on the page twice:

```html
  <h1>Admin</h1>
  <div class="sub">LEA Reviewer</div>
```

- [ ] **Step 2: Delete the dead tab-strip rules**

Remove `.tabs{...}`, `.tab-btn{...}` and `.tab-btn.active{...}` — nothing renders them now.

- [ ] **Step 3: Add the nav styles**

```css
  /* Navigation — one list, two placements. Under 720px it is a bar pinned to
     the bottom of the screen, where a thumb is; at 720 and up it is a sidebar
     with the page title folded into its top, which is what lets the first
     card start at the top of the window instead of 156px down. */
  .nav-item{
    display:flex; align-items:center; gap:9px; background:transparent; border:none;
    color:var(--muted); font-family:var(--font-body); cursor:pointer; width:100%;
    text-align:left; padding:10px 14px; font-size:14px; border-radius:8px;
  }
  .nav-item:hover{color:var(--ink); background:rgba(111,168,207,0.06); border-color:transparent;}
  .nav-item.on{color:var(--gold-bright); font-weight:600;}
  .nav-ico{display:inline-flex; flex-shrink:0;}
  .nav-ico svg{width:20px; height:20px;}

  .nav-brand{padding:0 14px 14px; border-bottom:1px solid var(--line); margin-bottom:10px;}
  .nav-brand h1{font-size:28px; margin:0 0 2px;}
  .nav-brand .sub{margin:0;}

  /* Phone: the sidebar is not rendered, the bar is. */
  @media (max-width:719px){
    .nav-side{display:none;}
    .nav-bar{
      position:fixed; left:0; right:0; bottom:0; z-index:20;
      display:flex; background:var(--bg-panel-deep);
      border-top:1px solid var(--line);
      padding:6px 2px calc(8px + env(safe-area-inset-bottom, 0px));
    }
    .nav-bar .nav-item{
      flex:1; flex-direction:column; gap:2px; padding:6px 2px; min-height:46px;
      font-size:10.5px; text-align:center; justify-content:center;
    }
    .nav-bar .nav-ico svg{width:19px; height:19px;}
    /* Room for the bar, so the last card is never sitting under it. */
    body{padding-bottom:calc(74px + env(safe-area-inset-bottom, 0px));}
    /* Touch floor — nothing tappable smaller than this on a phone. */
    button{min-height:32px;}
  }

  /* Laptop: the bar is not rendered, the sidebar is. */
  @media (min-width:720px){
    .nav-bar{display:none;}
    body{padding:24px 16px 60px;}
    .wrap{max-width:1060px; display:flex; gap:26px; align-items:flex-start;}
    .nav-side{
      width:200px; flex-shrink:0; position:sticky; top:24px;
      background:var(--bg-panel-deep); border:1px solid var(--line);
      border-radius:12px; padding:16px 6px 10px;
    }
    #sections{flex:1; min-width:0;}
  }
```

- [ ] **Step 4: Move `#nav` and `#sections` to be siblings inside `.wrap`**

The laptop rule makes `.wrap` a flex row of sidebar and content, so `#nav` and `#sections` must be direct children of `.wrap`, with `#panel` unwrapped or itself made the flex container. Confirm the final structure is:

```html
<div class="wrap">
  <div id="gate" class="card msg info">Checking your session…</div>
  <div id="panel" style="display:none;">
    <nav id="nav"></nav>
    <div id="sections"> … five divs … </div>
  </div>
</div>
```

and move the flex rules from `.wrap` onto `#panel`, since `#gate` must not become a flex child. Update the CSS from Step 3 accordingly: `.wrap{max-width:1060px;}` and `#panel{display:flex; gap:26px; align-items:flex-start;}` inside the 720px query.

- [ ] **Step 5: Check both widths in the browser**

Generate a static preview (the panel is password-gated, so render it rather than logging in):

```bash
node -e "
const fs=require('fs');const {boot}=require('./tools/tests/lib/admin-dom.js');
const src=fs.readFileSync('admin.html','utf8');
const head=src.slice(src.indexOf('<head>'),src.indexOf('</head>'));
const {window:w,api}=boot('admin.html');
api.setSubjects([{id:'building-laws',name:'Building Laws',blurb:'Codes',ready:true,modules:[{id:'building-laws-1',no:'1',title:'PD 1096',total:100,file:'data/building-laws/1.json',format:'json'}]},{id:'professional-practice',name:'Professional Practice',ready:true,modules:[]}]);
api.renderNav();api.renderSubjectsTab();
const p=w.document.getElementById('panel');p.style.display='block';
fs.writeFileSync('.superpowers/shell-preview.html','<!doctype html><html>'+head+'</head><body>'+w.document.querySelector('.wrap').outerHTML+'</body></html>');
console.log('wrote .superpowers/shell-preview.html');"
```

Open it in the browser pane. At **375×812** assert: `document.documentElement.scrollWidth === window.innerWidth` (no sideways scroll), the bottom bar is visible with five items, and the last card is not covered by it. At **1440×900** assert: the sidebar is present, the bottom bar is not, and the first card's `getBoundingClientRect().top` is under 60px (it was 156px).

- [ ] **Step 6: Run every suite**

Run: `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add admin.html
git commit -m "Place the nav: bottom bar on a phone, sidebar on a laptop

The tab strip was 566px wide inside a 343px container with no scroller
of its own, so it dragged the whole page sideways and Reports sat off
the edge. On a laptop the panel wasted 310px of grid each side and
156px of chrome above the first card; the title now lives in the
sidebar, which recovers it."
```

---

### Task 6: The Reports count

**Files:**
- Modify: `admin.html` — boot sequence (~line 767), `navItemsHtml` from Task 4
- Modify: `tools/tests/admin-shell.test.js`
- Modify: `tools/tests/lib/admin-dom.js`

**Interfaces:**
- Consumes: `loadReports()` (`admin.html:679`), `reportsByQuestionRef`, `SECTIONS`, `navItemsHtml`.
- Produces: `openReportCount()` → integer, the number of distinct question refs with open reports. Zero means render no badge.

- [ ] **Step 1: Write the failing test**

Add to `tools/tests/admin-shell.test.js`, and make the harness able to seed reports:

```js
check('the badge counts distinct questions, matching the Reports heading', () => {
  const { api, doc } = scene();
  api.setReports([
    { question_ref: 'building-laws/building-laws-1/3', reason: 'key',     created_at: '2026-01-01' },
    { question_ref: 'building-laws/building-laws-1/3', reason: 'wording', created_at: '2026-01-02' },
    { question_ref: 'building-laws/building-laws-1/9', reason: 'key',     created_at: '2026-01-03' },
  ]);
  assert(api.openReportCount() === 2, 'two questions, three reports — got ' + api.openReportCount());
  api.renderNav();
  const badges = [...doc.querySelectorAll('.nav-badge')];
  assert(badges.length === 2, 'badge should appear in both placements, got ' + badges.length);
  assert(badges.every(b => b.textContent.trim() === '2'), 'badge text: ' + badges.map(b => b.textContent).join());
});

check('no badge at all when nothing is open', () => {
  const { api, doc } = scene();
  api.setReports([]);
  api.renderNav();
  assert(api.openReportCount() === 0, 'count should be 0');
  assert(!doc.querySelector('.nav-badge'), 'a zero badge was rendered — it should be absent, not "0"');
});
```

Add to the harness `api` object literal in `tools/tests/lib/admin-dom.js`:

```js
    openReportCount,
    setReports(rows){
      openReports = rows;
      reportsByQuestionRef = {};
      rows.forEach(r => { (reportsByQuestionRef[r.question_ref] = reportsByQuestionRef[r.question_ref] || []).push(r); });
    },
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/tests/admin-shell.test.js`
Expected: FAIL — `openReportCount is not defined`.

- [ ] **Step 3: Add the count**

Next to `loadReports` in `admin.html`:

```js
// The number on the Reports nav item. Counts distinct questions, not reports,
// because that is what the Reports tab's own heading counts ("3 questions need
// a look") — two numbers for the same thing that disagree is worse than none.
function openReportCount(){
  return Object.keys(reportsByQuestionRef).length;
}
```

- [ ] **Step 4: Draw the badge**

In `navItemsHtml` from Task 4, inside the `SECTIONS.map`, before the returned string:

```js
    const n = s.id === 'reports' ? openReportCount() : 0;
    const badge = n ? '<span class="nav-badge">' + n + '</span>' : '';
```

and add `badge` after the label span:

```js
      '<span class="nav-label">' + escapeHtml(text) + '</span>' + badge +
```

CSS, alongside the other nav rules:

```css
  .nav-badge{
    background:var(--bad); color:var(--bg-deep); font-size:11px; font-weight:700;
    border-radius:10px; padding:1px 6px; margin-left:auto; line-height:1.5;
  }
  @media (max-width:719px){
    /* On the bar the item is a column, so the badge rides the icon instead. */
    .nav-bar .nav-item{position:relative;}
    .nav-bar .nav-badge{
      position:absolute; top:2px; left:50%; margin-left:6px; font-size:10px; padding:0 5px;
    }
  }
```

- [ ] **Step 5: Fetch reports at startup**

Reports are currently loaded only when that tab opens. In the boot sequence, after `await loadSubjects();`:

```js
  // The badge has to know before you visit the tab. A failed count is not a
  // reason to keep the panel from loading — the badge just does not appear.
  try{ await loadReports(); renderNav(); }
  catch(e){ console.warn('Could not count open reports:', e); }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node tools/tests/admin-shell.test.js`
Expected: `all passing`, 11 cases.

- [ ] **Step 7: Prove a failed fetch does not break the panel**

Run:

```bash
node -e "
const {boot}=require('./tools/tests/lib/admin-dom.js');
const {window:w,api}=boot('admin.html');
api.setSubjects([{id:'x',name:'X',ready:true,modules:[]}]);
api.renderNav();
if(w.document.querySelector('.nav-badge')) throw new Error('badge rendered with no report data');
if(!w.document.querySelector('#navBar [data-section=\"reports\"]')) throw new Error('Reports item missing');
console.log('  PASS  panel renders with no report data');"
```

Expected: one PASS line.

- [ ] **Step 8: Commit**

```bash
git add admin.html tools/tests/
git commit -m "Show the number of open reports on the nav

Counts distinct questions, the same number the Reports heading prints,
so the two can never disagree. Reports were only fetched when that tab
opened, so the count is now loaded at startup — and a failed fetch
drops the badge rather than the panel."
```

---

### Task 7: One card shape, and a wording pass

**Files:**
- Modify: `admin.html` stylesheet — `.card`, `.rep-*`, `.rw-*`, `.subj-*`
- Modify: `admin.html` — headings and helper text in the shell

**Interfaces:**
- Consumes: nothing new.
- Produces: `.panel-card` (base) and `.panel-card-head` / `.panel-card-body`. `.rep`, `.rw-job` and `.subj` keep their own class names and add the base.

- [ ] **Step 1: Write the failing test**

Add to `tools/tests/admin-shell.test.js`:

```js
check('the three rebuilt tabs share one card base', () => {
  const { w } = scene();
  const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  assert(/\.panel-card\s*\{/.test(css), 'no .panel-card base rule');
  // Each family opts in rather than redeclaring the same border/radius/background.
  ['.rep', '.rw-job', '.subj'].forEach(sel => {
    const re = new RegExp('\\' + sel + '[,\\s{]');
    assert(re.test(css), sel + ' is gone — do not rename the rebuilt tabs\' classes');
  });
});

check('no repository paths in the shell copy', () => {
  const { w } = scene();
  const shellText = w.document.getElementById('nav').textContent;
  assert(!/data\/|\.json|subjects\.json/.test(shellText),
    'a file path leaked into the navigation copy');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/tests/admin-shell.test.js`
Expected: FAIL — `no .panel-card base rule`.

- [ ] **Step 3: Add the base and opt the families in**

```css
  /* One card shape. The Reports and Rework rebuilds arrived at the same thing
     independently — a bordered panel with a head you tap and a body that
     unfolds — and the Subjects rebuild copied it a third time. Declared once
     here; the three families keep their own names and add only what differs. */
  .panel-card{
    border:1px solid var(--line); border-radius:12px; background:var(--bg-panel-deep);
    margin-bottom:14px; overflow:hidden;
  }
  .panel-card-head{display:flex; gap:14px; align-items:flex-start; padding:16px; cursor:pointer;}
  .panel-card-head:hover{background:rgba(111,168,207,0.05);}
  .panel-card-body{padding:0 16px 16px; border-top:1px solid var(--line);}
```

Then change `.rep{...}`, `.subj{...}` and the rework job card to reference the base rather than restating border/radius/background/margin/overflow. Do this by adding `panel-card` to their class attributes in the render functions, and deleting only the now-duplicated declarations from their rules. **Do not rename `.rep-*`, `.rw-*` or `.subj-*`** — three tabs' render functions and the Subjects tests depend on those names.

- [ ] **Step 4: Wording pass**

These are the exact strings, with their replacements. Nothing else in the shell renders prose.

`admin.html:733` (logged-out gate) and `admin.html:740` (not-an-admin gate) already
say what to do rather than what failed — leave both alone.

`admin.html:748`, the Subjects loading line:

```js
tabSubjectsEl.innerHTML = '<div class="card msg info">Loading current subjects from GitHub…</div>';
```

becomes:

```js
tabSubjectsEl.innerHTML = '<div class="card msg info">Loading your subjects…</div>';
```

`admin.html:1350`, the Deleted loading line:

```js
tabDeletedEl.innerHTML = '<div class="card msg info">Reading the archive from GitHub…</div>';
```

becomes:

```js
tabDeletedEl.innerHTML = '<div class="card msg info">Looking for removed modules…</div>';
```

`admin.html:1363`, the empty-archive line:

```js
'Nothing archived yet. Removing a module (Subjects tab) and pressing "Save to site" is what puts a copy here.'
```

becomes:

```js
'Nothing here yet. When you remove a module from a subject and press "Save to site", a copy is kept here so you can put it back.'
```

Then run `grep -n "GitHub" admin.html`. Remaining hits inside the Reports and
Rework tabs' interiors are out of scope — leave them.

- [ ] **Step 5: Run the tests**

Run: `node tools/tests/admin-shell.test.js && node tools/tests/subjects-tab.test.js`
Expected: both `all passing`. `subjects-tab.test.js` is the guard that the card refactor did not break the tab rebuilt last session.

- [ ] **Step 6: Re-check both widths**

Regenerate the preview from Task 5 Step 5 and confirm at 375px and 1440px that the cards still look right — a shared base is exactly where a stray inherited padding shows up.

- [ ] **Step 7: Commit**

```bash
git add admin.html tools/tests/
git commit -m "Give the rebuilt tabs one card shape instead of three copies"
```

---

### Task 8: Rebuild the Deleted tab

**Files:**
- Modify: `admin.html:~1349-1412` (`scanDeletedModules`)
- Modify: `admin.html:~1414+` (`publishArchivedFile`)
- Modify: `tools/tests/admin-shell.test.js`

**Interfaces:**
- Consumes: `nextModuleNo(subject)`, `fillInKnownTitles(rows)`, `peekUnlistedFile(row)` — all shared with the Subjects tab's scanner, all unchanged.
- Produces: `derivedModuleId(subjectId, no)` → `subjectId + '-' + String(Number(no))`, and `moduleIdTaken(subject, id)` → boolean.

- [ ] **Step 1: Write the failing test**

```js
check('a restored module gets its id derived, not typed', () => {
  const { api } = scene();
  assert(api.derivedModuleId('building-laws', '05') === 'building-laws-5',
    'got ' + api.derivedModuleId('building-laws', '05'));
  assert(api.derivedModuleId('professional-practice', '12') === 'professional-practice-12',
    'got ' + api.derivedModuleId('professional-practice', '12'));
});

check('a restore that would collide is refused, naming the module in the way', () => {
  const { api } = scene();
  const subject = { id:'building-laws', name:'Building Laws', modules:[
    { id:'building-laws-5', no:'5', title:'PD 1096' } ] };
  assert(api.moduleIdTaken(subject, 'building-laws-5') === true, 'collision not detected');
  assert(api.moduleIdTaken(subject, 'building-laws-6') === false, 'false collision');
});

check('the deleted list shows module names, not archive paths, as the headline', () => {
  const { doc, api } = scene();
  api.renderDeletedCards([
    { path:'data/_deleted/building-laws-2-1734021882.json', title:'RA 9514 — Fire Code',
      subjectName:'Building Laws', no:'2', total:150, removedAt:'12 Dec' },
  ]);
  const card = doc.querySelector('#tab-deleted .panel-card');
  assert(card, 'no card rendered');
  const head = card.querySelector('.del-title').textContent;
  assert(head.includes('RA 9514'), 'headline is not the module title: ' + head);
  assert(!head.includes('data/_deleted'), 'the archive path is still the headline');
  assert(card.textContent.includes('Put it back'), 'no restore button');
  assert(!card.querySelector('[data-role="d-id"]'), 'the module id box should be gone');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/tests/admin-shell.test.js`
Expected: FAIL — `api.derivedModuleId is not a function`.

- [ ] **Step 3: Lift out the subject dropdown**

`scanDeletedModules` builds its subject `<option>` list inline, and
`renderDeletedCards` needs the same list. Lift it out first:

```js
function subjectOptionsHtml(selectedId){
  return subjects.map(s =>
    '<option value="' + escapeHtml(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' +
    escapeHtml(s.name) + '</option>').join('');
}
```

Then replace the inline `const options = subjects.map(...)` in
`scanDeletedModules` with a call to it.

- [ ] **Step 4: Add the id helpers**

```js
// Module ids are <subject-id>-<no> everywhere in the manifest, so restoring
// derives one rather than asking for it. The old blank "New module id" box
// could be filled with anything, including something inconsistent with the
// rest of the subject.
function derivedModuleId(subjectId, no){
  return subjectId + '-' + String(Number(no));
}
function moduleIdTaken(subject, id){
  return (subject.modules || []).some(m => m.id === id);
}
```

- [ ] **Step 5: Render cards instead of rows**

Replace the `.unlisted-row` markup in `scanDeletedModules` with one `.panel-card` per archived file, in a `renderDeletedCards(items)` function so the test can drive it directly:

```js
function renderDeletedCards(items){
  document.getElementById('tab-deleted').innerHTML = items.map((it, i) => `
    <div class="panel-card" data-path="${escapeHtml(it.path)}">
      <div class="panel-card-body" style="border-top:none;padding-top:16px;">
        <div class="del-title">${escapeHtml(it.title || 'Untitled module')}</div>
        <div class="del-meta">${escapeHtml(it.subjectName || 'unknown subject')}
          &middot; was module ${escapeHtml(it.no || '?')}
          ${it.total ? '&middot; ' + it.total + ' question' + (it.total === 1 ? '' : 's') : ''}
          ${it.removedAt ? '&middot; removed ' + escapeHtml(it.removedAt) : ''}</div>
        <div class="actions">
          <button class="primary" data-action="d-publish" data-idx="${i}">Put it back</button>
          <button data-action="d-peek" data-idx="${i}">Preview</button>
        </div>
        <details class="subj-more">
          <summary>Change where it goes&hellip;</summary>
          <div class="subj-field">
            <label>Subject</label>
            <select data-role="d-subject">${subjectOptionsHtml()}</select>
          </div>
          <div class="subj-field">
            <label>Module number</label>
            <input type="text" data-role="d-no" maxlength="2" value="${escapeHtml(it.no || '')}">
          </div>
          <div class="del-path">${escapeHtml(it.path)}</div>
        </details>
      </div>
    </div>`).join('');
}
```

The archive path stays inside the disclosure — it is the only unambiguous identifier when two archived copies share a title.

- [ ] **Step 6: Derive the id on restore, and refuse a collision**

In `publishArchivedFile`, replace the read of the removed `d-id` input with:

```js
  const id = derivedModuleId(subjectId, no);
  const subject = subjects.find(s => s.id === subjectId);
  if(subject && moduleIdTaken(subject, id)){
    const clash = subject.modules.find(m => m.id === id);
    await LEAAlert('"' + (clash.title || clash.id) + '" is already module ' + no +
      ' of ' + subject.name + '. Pick a different number under "Change where it goes".');
    return;
  }
```

It must not silently pick another number — a number is how a reader finds the module.

- [ ] **Step 7: Add the card styles**

```css
  .del-title{font-size:15px; font-weight:600; line-height:1.4; word-break:break-word;}
  .del-meta{font-size:12.5px; color:var(--muted); margin-top:5px;}
  .del-path{font-family:var(--font-mono); font-size:11px; color:var(--muted);
            word-break:break-all; margin-top:12px;}
```

- [ ] **Step 8: Export the new bindings to the harness**

The Task 8 tests reach these through `api`. Add to the object literal inside
`vm.runInContext` in `tools/tests/lib/admin-dom.js`:

```js
    derivedModuleId, moduleIdTaken, renderDeletedCards,
```

- [ ] **Step 9: Run the tests**

Run: `node tools/tests/admin-shell.test.js`
Expected: `all passing`, 16 cases.

- [ ] **Step 10: Run every suite**

Run: `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done`
Expected: all five pass.

- [ ] **Step 11: Commit**

```bash
git add admin.html tools/tests/
git commit -m "Rebuild the Deleted tab around module names

The archive filename was the headline and five controls shared one
flex line, including a blank box asking you to invent a module id.
The module's own name is the headline now, one button puts it back
where it came from, and the id is derived as <subject-id>-<no> the way
every other module in the manifest is named. A restore that would
collide is refused and names the module in the way rather than
quietly renumbering."
```

---

## Final verification

- [ ] `for t in tools/tests/*.test.js; do node "$t" || echo "FAILED $t"; done` — all five suites pass.
- [ ] Preview at 375×812: `scrollWidth === innerWidth`, bottom bar with five items, last card clear of the bar.
- [ ] Preview at 1440×900: sidebar present, bottom bar absent, first card within 60px of the top.
- [ ] `grep -n "tab-btn\|tabUploadEl\|renderUploadTab" admin.html` — no output.
- [ ] `grep -rn "icons.js?v=" --include=*.html . | grep -v "v=17"` — no output.
- [ ] Update `HANDOFF.md`: mark task 2 done, and correct its claim that the Add Module tab was already deleted.

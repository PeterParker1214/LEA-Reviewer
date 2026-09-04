// The shell: one list of sections, two places it is drawn, one switcher.
const { boot } = require('./lib/admin-dom.js');

// showSection() deliberately does not swallow a render's rejection (that is
// the fix under test: the error must still surface). This test file isn't
// asserting *where* it surfaces, only that a failed render is retried — so
// keep Node from treating the expected rejection as a crash.
process.on('unhandledRejection', () => {});

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

check('a "once" section whose render fails the first time is retried on the next open', async () => {
  const { api } = scene();
  let runs = 0;
  const pages = api.SECTIONS.find(s => s.id === 'pages');
  pages.render = () => {
    runs++;
    return runs === 1 ? Promise.reject(new Error('network error')) : Promise.resolve();
  };
  api.showSection('subjects'); // reset currentSectionId so the second call below is a real "open"
  api.showSection('pages');
  await new Promise(r => setTimeout(r, 0));
  api.showSection('subjects');
  api.showSection('pages');
  await new Promise(r => setTimeout(r, 0));
  assert(runs === 2, 'render ran ' + runs + ' times, expected 2 (failure must not stick)');
});

check('a "once" section whose render succeeds still only runs once', async () => {
  const { api } = scene();
  let runs = 0;
  const pages = api.SECTIONS.find(s => s.id === 'pages');
  pages.render = () => { runs++; return Promise.resolve(); };
  api.showSection('pages');
  await new Promise(r => setTimeout(r, 0));
  api.showSection('subjects');
  api.showSection('pages');
  await new Promise(r => setTimeout(r, 0));
  assert(runs === 1, 'render ran ' + runs + ' times, expected 1 (success must still be remembered)');
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

// These two drive the REAL markReportSolved / dismissReportGroup functions
// (not a re-enactment of what they're supposed to do) via a renderNav spy
// installed through the mutable top-level function-declaration binding. If
// the renderNav() call is ever removed from either function, the spy never
// fires and the test fails — see task-6-report.md for the revert-and-fail
// proof.
check('markReportSolved calls renderNav after closing the report', async () => {
  const { api } = scene();
  api.setReports([
    { question_ref: 'building-laws/building-laws-1/3', user_id: 'u1', reason: 'key', created_at: '2026-01-01', id: 'r1', status: 'open' },
  ]);
  const order = [];
  api.spyLoadReports(async () => { order.push('loadReports'); });
  api.spyRenderNav(() => { order.push('renderNav'); });

  await api.markReportSolved('building-laws/building-laws-1/3');

  assert(order.includes('renderNav'), 'markReportSolved never called renderNav — the badge would go stale');
  assert(order.indexOf('renderNav') > order.indexOf('loadReports'),
    'renderNav must run after loadReports so it sees the fresh count, got order: ' + order.join(','));
});

check('dismissReportGroup calls renderNav after closing the report', async () => {
  const { api } = scene();
  api.setReports([
    { question_ref: 'building-laws/building-laws-1/9', user_id: 'u2', reason: 'wording', created_at: '2026-01-02', id: 'r2', status: 'open' },
  ]);
  const order = [];
  api.spyLoadReports(async () => { order.push('loadReports'); });
  api.spyRenderNav(() => { order.push('renderNav'); });

  await api.dismissReportGroup('building-laws/building-laws-1/9');

  assert(order.includes('renderNav'), 'dismissReportGroup never called renderNav — the badge would go stale');
  assert(order.indexOf('renderNav') > order.indexOf('loadReports'),
    'renderNav must run after loadReports so it sees the fresh count, got order: ' + order.join(','));
});

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

check('no repository paths in the shell copy', () => {
  const { w } = scene();
  const shellText = w.document.getElementById('nav').textContent;
  assert(!/data\/|\.json|subjects\.json/.test(shellText),
    'a file path leaked into the navigation copy');
});

runAll().then(() => {
  console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
  process.exitCode = failures ? 1 : 0;
});

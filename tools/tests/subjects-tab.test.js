// Exercises the rebuilt Subjects tab in a jsdom DOM, per HANDOFF.md: build the
// document, run both inline script blocks with vm.runInContext against
// dom.getInternalVMContext(), and stub everything admin.html reaches for.
//
// The point is not the markup. It is that a presentation rewrite did not
// disturb the things keyed by subject/module identity: the manifest array, the
// removal bookkeeping, and the order of subjects.
const { boot } = require('./lib/admin-dom.js');

const ADMIN = process.argv[2] || 'admin.html';

function makeSubjects() {
  return [
    { id: 'building-laws', name: 'Building Laws', blurb: 'Codes and ordinances', ready: true,
      modules: [
        { id: 'building-laws-1', no: '1', title: 'PD 1096', total: 100, file: 'data/building-laws/1.json', format: 'json' },
        { id: 'building-laws-2', no: '2', title: 'RA 9514', total: 1, file: 'data/building-laws/2.json', format: 'json', color: 'blue' },
      ] },
    { id: 'professional-practice', name: 'Professional Practice', blurb: '', ready: true,
      modules: [
        { id: 'professional-practice-1', no: '1', title: 'RA 9266', total: 50, file: 'data/professional-practice/1.json', format: 'json' },
      ] },
    { id: 'structural-design', name: 'Structural Design', blurb: '', ready: false, modules: [] },
  ];
}

let failures = 0;
const queued = [];
// Queued rather than run inline: half these cases await a confirmation dialog,
// and a synchronous runner reports PASS before such a body has even rejected.
function check(name, fn) { queued.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of queued) {
    try { await fn(); console.log('  PASS  ' + name); }
    catch (e) { failures++; console.log('  FAIL  ' + name + '\n        ' + ((e && e.message) || e)); }
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// Every test starts from a page that has just rendered a fresh manifest.
function scene() {
  const { window: w, api } = boot(ADMIN);
  api.setSubjects(makeSubjects());
  api.renderSubjectsTab();
  const tab = w.document.getElementById('tab-subjects');
  return { w, api, tab, cards: () => [...tab.querySelectorAll('.subj')] };
}
const textOf = el => el.textContent.replace(/\s+/g, ' ').trim();

console.log('\nSubjects tab\n');

check('every subject renders as one card, all collapsed', () => {
  const { tab, cards } = scene();
  assert(cards().length === 3, 'expected 3 cards, got ' + cards().length);
  assert(cards().every(c => !c.classList.contains('open')), 'a card started open');
  assert(tab.querySelectorAll('.subj-body').length === 0, 'a body rendered while collapsed');
  // Nothing editable is reachable until a card is opened.
  assert(tab.querySelectorAll('input[data-field]').length === 0, 'inputs rendered while collapsed');
});

check('a collapsed card shows name, status and counts', () => {
  const { cards } = scene();
  const [bl, , sd] = cards();
  assert(/Building Laws/.test(textOf(bl)), 'name missing');
  assert(/2 modules · 101 questions/.test(textOf(bl)), 'counts wrong: ' + textOf(bl));
  assert(textOf(bl.querySelector('.subj-pill')) === 'Available', 'ready subject not marked Available');
  assert(/No modules yet/.test(textOf(sd)), 'empty subject should say so: ' + textOf(sd));
  assert(textOf(sd.querySelector('.subj-pill')) === 'Coming soon', 'unready subject not marked Coming soon');
});

check('opening a card does not mutate the manifest', () => {
  const { api, tab } = scene();
  const before = JSON.stringify(api.subjects);
  tab.querySelector('.subj-head').click();
  tab.querySelector('.subj-head').click();   // and closed again
  assert(JSON.stringify(api.subjects) === before, 'an open/close cycle changed the data');
  assert(api.subjects === api.manifestSubjects, 'subjects and manifestSubjects came apart');
});

check('an opened card exposes the editor and its modules', () => {
  const { tab, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  const card = cards()[0];
  assert(card.classList.contains('open'), 'card did not open');
  assert(card.querySelector('input[data-field="name"]').value === 'Building Laws', 'name field wrong');
  assert(card.querySelector('input[data-field="blurb"]').value === 'Codes and ordinances', 'blurb field wrong');
  assert(card.querySelectorAll('.mod-row').length === 2, 'module rows missing');
  assert(/\b1 question\b/.test(textOf(card.querySelectorAll('.mod-row')[1])),
    'singular "question" not used for a 1-question module');
  assert(card.querySelector('button[data-action="delete"]'), 'no delete button');
  // Only the open card has a body.
  assert(tab.querySelectorAll('.subj-body').length === 1, 'more than one body rendered');
});

check('typing a new name updates the manifest in place', () => {
  const { w, api, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  const inp = cards()[0].querySelector('input[data-field="name"]');
  inp.value = 'Building Laws & Codes';
  inp.dispatchEvent(new w.Event('input'));
  assert(api.subjects[0].name === 'Building Laws & Codes', 'name not written through');
  assert(api.manifestSubjects[0].name === 'Building Laws & Codes', 'manifestSubjects did not see it');
});

check('the status toggle flips ready and keeps the card open', () => {
  const { api, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  cards()[0].querySelector('button[data-action="toggle"]').click();
  assert(api.subjects[0].ready === false, 'ready not flipped');
  assert(cards()[0].classList.contains('open'), 'card closed on re-render');
  assert(textOf(cards()[0].querySelector('.subj-pill')) === 'Coming soon', 'pill did not follow');
});

check('Move down swaps the right pair and the card stays open', () => {
  const { api, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  cards()[0].querySelector('button[data-action="down"]').click();
  assert(api.subjects.map(s => s.id).join() === 'professional-practice,building-laws,structural-design',
    'wrong order: ' + api.subjects.map(s => s.id).join());
  const moved = cards()[1];
  assert(moved.dataset.sid === 'building-laws', 'the moved subject is not where it should be');
  assert(moved.classList.contains('open'), 'the moved card closed');
  assert(!cards()[0].classList.contains('open'), 'the card it swapped with opened by mistake');
});

check('Move up/down are disabled at the ends', () => {
  const { cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  assert(cards()[0].querySelector('button[data-action="up"]').disabled, 'first card can move up');
  cards()[0].querySelector('.subj-head').click();
  cards()[2].querySelector('.subj-head').click();
  assert(cards()[2].querySelector('button[data-action="down"]').disabled, 'last card can move down');
});

check('removing a module records the archive and the removal key', async () => {
  const { api, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  cards()[0].querySelectorAll('button[data-action="mod-del"]')[1].click();
  await new Promise(r => setTimeout(r, 0));   // the handler awaits LEAConfirm
  assert(api.subjects[0].modules.length === 1, 'module not removed');
  assert(api.subjects[0].modules[0].id === 'building-laws-1', 'the wrong module was removed');
  assert(api.removedModuleKeys.has('building-laws|building-laws-2'), 'removal key not recorded');
  assert(api.pendingModuleArchives.some(a => a.subjectId === 'building-laws' && a.mod.id === 'building-laws-2'),
    'archive not queued');
});

check('a colour swatch writes color and clearing it deletes the key', () => {
  const { w, api, cards } = scene();
  cards()[0].querySelector('.subj-head').click();
  cards()[0].querySelectorAll('.mod-row')[0].querySelector('.swatch[data-colour="teal"]').click();
  assert(api.subjects[0].modules[0].color === 'teal', 'colour not set');
  // Same colour again means "no colour".
  cards()[0].querySelectorAll('.mod-row')[0].querySelector('.swatch[data-colour="teal"]').click();
  assert(!('color' in api.subjects[0].modules[0]), 'colour not cleared');
  assert(/Save to site/.test(w.document.getElementById('subjectsSaveStatus').textContent),
    'no prompt to save after a colour change');
});

check('deleting a subject drops it and forgets that it was open', async () => {
  const { api, cards } = scene();
  cards()[2].querySelector('.subj-head').click();
  cards()[2].querySelector('button[data-action="delete"]').click();
  await new Promise(r => setTimeout(r, 0));
  assert(api.subjects.length === 2, 'subject not deleted');
  assert(!api.subjects.some(s => s.id === 'structural-design'), 'the wrong subject went');
  assert(!api.openSubjects.has('structural-design'), 'the open-state set kept a dead id');
});

check('a new subject arrives open, empty and not ready', async () => {
  const { w, api, tab, cards } = scene();
  w.document.getElementById('addSubjectBtn').click();
  await new Promise(r => setTimeout(r, 0));
  const added = api.subjects[api.subjects.length - 1];
  assert(added.id === 'new-subject', 'slug wrong: ' + added.id);
  assert(added.ready === false && added.modules.length === 0, 'new subject should be empty and hidden');
  assert(cards()[3].classList.contains('open'), 'new subject did not open for editing');
  assert(tab.querySelector('#saveSubjectsBtn'), 'save button lost after adding');
});

check('a pure open/close cycle leaves the saved JSON byte-identical', () => {
  const { api, tab } = scene();
  const before = api.manifestToJson(api.subjects);
  tab.querySelectorAll('.subj-head').forEach(h => h.click());
  [...tab.querySelectorAll('.subj-head')].reverse().forEach(h => h.click());
  assert(api.manifestToJson(api.subjects) === before,
    'opening and closing cards changed what would be written');
});

check('the unlisted-file scanner is still wired, now behind a disclosure', () => {
  const { tab } = scene();
  const more = tab.querySelector('details.subj-more');
  assert(more, 'scanner disclosure missing');
  assert(!more.open, 'the scanner should start closed');
  assert(more.querySelector('#scanUnlistedBtn'), 'scan button missing');
  assert(more.querySelector('#unlistedOut'), 'scan output target missing');
});

runAll().then(() => {
  console.log(failures ? `\n${failures} failing\n` : '\nall passing\n');
  process.exitCode = failures ? 1 : 0;
});

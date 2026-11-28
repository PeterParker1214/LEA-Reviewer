/*
 * Flashcards: deck built from the question bank, SM-2 schedule, per-user
 * storage, offline precache, image credits. Run: node tools/tests/flashcards.test.js
 * Prints one OK line per automated gate.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
require(path.join(ROOT, 'assets', 'srs.js'));
const S = globalThis.LEASrs;

// ---- F1 deck from the bank ----
const subjects = JSON.parse(read('data/subjects.json'));
const subj = subjects.find((s) => s.decks && s.decks.length);
const cfg = subj.decks[0];
const rows = JSON.parse(read(cfg.source));
const deck = S.buildDeck(cfg, rows, JSON.parse(read(cfg.lookup)));
assert.equal(subj.id, 'architectural-sites-proponents-styles');
assert.equal(deck.cards.length + deck.skipped.length, rows.length, 'every bank row is a card or a listed skip');
assert.ok(deck.cards.length > 400, 'deck has its cards: ' + deck.cards.length);
deck.cards.forEach((c) => {
  assert.ok(c.img && c.name && c.architect, 'card ' + c.id + ' has picture, name, architect');
  assert.ok(fs.existsSync(path.join(ROOT, 'data', subj.id, c.img)), 'picture file exists for ' + c.id);
});
assert.equal(new Set(deck.cards.map((c) => c.id)).size, deck.cards.length, 'card ids are unique');
const byId = Object.fromEntries(deck.cards.map((c) => [c.id, c]));
assert.equal(byId.q0042.architect, 'Arnolfo di Cambio', 'architect from module 02');
assert.equal(byId.q0583.architect, 'Nicola Salvi', 'architect from the note');
const report = read('data/architectural-sites-proponents-styles/flashcards-images.md');
deck.skipped.forEach((s) => assert.ok(report.includes(s.id + ' —'), 'skip listed: ' + s.id));
console.log('FLASHCARDS OK (' + deck.cards.length + ' cards, ' + deck.skipped.length + ' skipped)');

// ---- F2 scheduler ----
const T = Date.UTC(2026, 10, 28, 4, 0, 0), MIN = S.MIN, DAY = S.DAY;
let p = S.preview(undefined, T);
assert.ok(p[0] <= 1 * MIN, 'new: Again within a minute');
assert.ok(p[0] < p[1] && p[1] < p[2] && p[2] < p[3], 'new: Again < Hard < Good < Easy');
assert.equal(p[3], 4 * DAY, 'new: Easy = 4 days');
assert.deepEqual(p.map(S.fmt), ['1 min', '6 min', '10 min', '4 days'], 'button labels');
let s = S.schedule(undefined, 3, T);            // Good -> 10 min step
assert.equal(s.due - T, 10 * MIN);
s = S.schedule(s, 3, T + 10 * MIN);             // Good -> graduates 1 day
assert.equal(s.q, 2); assert.equal(s.ivl, 1);
s = S.schedule(s, 3, T + DAY);                  // Good -> 1 * 2.5 rounded
assert.ok(s.ivl >= 2, 'review interval grows');
const rv = S.preview(s, T + 4 * DAY);
assert.ok(rv[0] <= 10 * MIN, 'review: Again comes back within minutes');
assert.ok(rv[1] < rv[2] && rv[2] < rv[3], 'review: Hard < Good < Easy');
assert.ok(rv[3] >= 3 * DAY, 'review: Easy is days later');
const lapsed = S.schedule(s, 1, T + 4 * DAY);
assert.equal(lapsed.q, 3); assert.ok(lapsed.ef < s.ef && lapsed.ef >= 1.3); assert.equal(lapsed.lapses, 1);
assert.ok(S.isWeak(lapsed), 'a lapsed card is weak');
// queue: due learning first, then reviews, then new within the limit
const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const st = { a: { q: 2, due: T - 1, ef: 2.5 }, b: { q: 1, due: T - 1, ef: 2.5 } };
assert.equal(S.next(cards, st, T, { newLeft: 5 }).id, 'b');
assert.equal(S.next(cards, { a: st.a }, T, { newLeft: 5 }).id, 'a');
assert.equal(S.next(cards, {}, T, { newLeft: 0 }), null, 'daily new limit holds');
assert.deepEqual(S.counts(cards, st, T, 10), { neu: 1, learn: 1, due: 1 });
assert.equal(S.next(cards, { a: st.a, b: { q: 2, due: T + DAY, ef: 2.0, lapses: 1 } }, T, { weak: true }).id, 'b', 'weak-only mode');
console.log('SCHEDULER OK');

// ---- F3 storage ----
const mine = { uid: 'u1', t: 2, cards: { a: { q: 2, u: 5 } }, log: { d: 3 } };
const other = { uid: 'u2', t: 9, cards: { a: { q: 1, u: 99 } } };
assert.equal(S.forUser(other, 'u1'), null, 'another user\'s blob is ignored');
assert.equal(S.forUser(mine, 'u1'), mine);
const m = S.merge(mine, { uid: 'u1', t: 3, cards: { a: { q: 1, u: 4 }, b: { q: 2, u: 7 } }, log: { d: 1, e: 2 } });
assert.equal(m.cards.a.u, 5, 'newer card state wins'); assert.ok(m.cards.b, 'cards from both devices kept');
assert.deepEqual(m.log, { d: 3, e: 2 });
assert.deepEqual(S.summary({ n: 10, cards: { a: { q: 2, due: T - 1 }, b: { q: 3, due: T + 1 } }, prefs: { newPerDay: 3 } }, T), { neu: 3, learn: 1, due: 1 });
assert.equal(S.streak({ [S.dayKey(T)]: 2, [S.dayKey(T - DAY)]: 1 }, T), 2);
const page = read('cards.html');
assert.ok(/'lea_fc_v1_' \+ uid/.test(page), 'local copy keyed by user id');
console.log('STORAGE OK');

// ---- F4 offline ----
const sw = read('sw.js');
const ver = (sw.match(/assets\/blueprint\.css\?v=(\d+)/) || [])[1];
['cards.html', 'assets/srs.js?v=' + ver, 'assets/sfx.js?v=' + ver].forEach((u) =>
  assert.ok(sw.includes("'" + u + "'"), 'precached: ' + u));
assert.ok(/prefetchImages/.test(page), 'deck pictures are fetched ahead for offline');
console.log('OFFLINE OK');

// ---- F5 images ----
deck.cards.forEach((c) => assert.ok(c.credit && c.license, 'credit + licence on ' + c.id));
assert.ok(/## Could not confirm/.test(report) && /## Pictures to check/.test(report));
assert.ok(/\.credit/.test(page) && /\.license/.test(page), 'credit and licence shown on the card back');
console.log('IMAGES OK');

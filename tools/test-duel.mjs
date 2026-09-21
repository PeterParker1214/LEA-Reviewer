/*
 * Checks assets/duel.js — whose turn it is, who won, and the running record.
 * Run: node tools/test-duel.mjs
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import assert from 'node:assert/strict';

runInThisContext(readFileSync(new URL('../assets/duel.js', import.meta.url), 'utf8'));
const D = globalThis.LEADuel;

const ME = 'me', ANA = 'ana';
const NOW = '2026-09-21T12:00:00Z';
const TODAY = '2026-09-21T09:00:00Z';
const OLD = '2026-09-10T09:00:00Z';

const duel = (over) => Object.assign({
  id: 'd1', challenger: ME, opponent: ANA, subject: 'building-laws',
  questions: [], challenger_score: null, opponent_score: null,
  status: 'pending', created_at: TODAY
}, over);

// Ten distinct questions, never the same one twice.
const cells = Array.from({ length: 12 }, (_, i) => ({ subjectId: 'bl', moduleId: '03', qIndex: i }));
const drawn = D.drawQuestions(cells, 10, () => 0.999);
assert.equal(drawn.length, 10);
assert.equal(new Set(drawn.map(q => q.i)).size, 10, 'no question is drawn twice');
assert.deepEqual(Object.keys(drawn[0]), ['s', 'm', 'i']);
assert.equal(D.drawQuestions(cells.slice(0, 4), 10, Math.random).length, 4, 'a thin subject gives what it has');

// Whose move is it.
assert.equal(D.phase(duel(), ME, NOW), 'your-turn', 'the challenger can play before an answer');
assert.equal(D.phase(duel(), ANA, NOW), 'invited');
assert.equal(D.phase(duel({ status: 'accepted', challenger_score: 8 }), ME, NOW), 'waiting');
assert.equal(D.phase(duel({ status: 'accepted', challenger_score: 8 }), ANA, NOW), 'your-turn');
assert.equal(D.phase(duel({ status: 'accepted', challenger_score: 8, opponent_score: 6 }), ME, NOW), 'done');
assert.equal(D.phase(duel({ status: 'declined' }), ME, NOW), 'declined');
assert.equal(D.phase(duel({ created_at: OLD }), ANA, NOW), 'expired', 'unanswered for three days');
assert.equal(D.phase(duel({ created_at: OLD, status: 'accepted' }), ANA, NOW), 'your-turn', 'accepted duels do not expire');
assert.equal(D.phase(duel(), 'someone-else', NOW), null, 'not your duel');

// Who won.
const finished = duel({ status: 'accepted', challenger_score: 8, opponent_score: 6 });
assert.equal(D.outcome(finished, ME), 'win');
assert.equal(D.outcome(finished, ANA), 'loss');
assert.equal(D.outcome(duel({ challenger_score: 7, opponent_score: 7 }), ME), 'draw');
assert.equal(D.outcome(duel({ challenger_score: 8 }), ME), null, 'no result until both have played');

// The record counts finished duels only, and reads from both sides.
const all = [
  finished,
  duel({ id: 'd2', challenger: ANA, opponent: ME, challenger_score: 9, opponent_score: 4 }),
  duel({ id: 'd3', challenger_score: 5, opponent_score: 5 }),
  duel({ id: 'd4', challenger_score: 10 }),
  duel({ id: 'd5', opponent: 'kev', challenger_score: 10, opponent_score: 1 })
];
assert.deepEqual(D.record(all, ME, ANA), { w: 1, l: 1, d: 1 });

// Your move first, then results, then what you are waiting on.
const order = D.sortForList([
  duel({ id: 'waiting', status: 'accepted', challenger_score: 8 }),
  duel({ id: 'done', challenger_score: 8, opponent_score: 2 }),
  duel({ id: 'invited', challenger: ANA, opponent: ME })
], ME, NOW).map(d => d.id);
assert.deepEqual(order, ['invited', 'done', 'waiting']);

console.log('duel helpers ok');

/* Round-trip check for the shared figure table: node tools/test-figure-pack.js
 *
 * packFigures lifts a picture used by more than one question into a figures
 * table; inflateFigures puts it back. If those two ever disagree, a module
 * saved by the admin comes back with its pictures on the wrong questions. */
const fs = require('fs');
const assert = require('assert');

globalThis.window = {};
new Function(fs.readFileSync(__dirname + '/../assets/quiz-source.js', 'utf8'))();
const S = window.LEAQuizSource;

const rows = [{ q: 'a', img: 'data:X' }, { q: 'b', img: 'data:X' },
              { q: 'c', img: 'data:Y' }, { q: 'd' }];
const packed = S.packFigures(rows);

assert.deepStrictEqual(Object.values(packed.figures), ['data:X'], 'only the repeat is lifted');
assert.strictEqual(packed.questions[0].fig, 'f1');
assert.strictEqual(packed.questions[0].img, undefined);
assert.strictEqual(packed.questions[2].img, 'data:Y', 'a one-off picture stays on its question');
assert.deepStrictEqual(S.inflateFigures(packed), rows, 'round trip');

// Nothing repeats, so the module keeps the plain array shape it had.
const plain = [{ q: 'a', img: 'data:Y' }, { q: 'b' }];
assert.deepStrictEqual(S.packFigures(plain), plain);
assert.deepStrictEqual(S.inflateFigures(plain), plain);

console.log('figure pack/inflate: OK');

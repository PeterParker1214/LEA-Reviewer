// Modules were appended in the order they happened to be uploaded, so the
// numbers printed on them stopped matching the order readers saw them in —
// 05 sat after 33, and a file recovered from the unlisted scan landed at the
// very end. Every write goes through manifestToJson, so sorting there is what
// makes the whole site come out in order.
const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

const src = fs.readFileSync('admin.html', 'utf8');
const start = src.indexOf('function manifestToJson(list){');
if (start < 0) throw new Error('manifestToJson is not in admin.html any more');
const end = src.indexOf('\n}', start) + 2;

const ctx = { JSON, Object, parseInt, isNaN, console };
vm.createContext(ctx);
const manifestToJson = vm.runInContext(src.slice(start, end) + ';manifestToJson', ctx);

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); }
  catch (e) { failures++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const numbers = (subject) => (subject.modules || []).map((m) => m.no);

check('an out-of-order subject comes back in number order', () => {
  const out = JSON.parse(manifestToJson([{
    id: 's', name: 'S', modules: [
      { id: 'a', no: '09' }, { id: 'b', no: '02' },
      { id: 'c', no: '33' }, { id: 'd', no: '05' },
    ],
  }]));
  assert(numbers(out[0]).join(',') === '02,05,09,33', 'got ' + numbers(out[0]).join(','));
});

check('a module with no number goes last rather than to the front', () => {
  const out = JSON.parse(manifestToJson([{
    id: 's', modules: [{ id: 'a' }, { id: 'b', no: '02' }, { id: 'c', no: '01' }],
  }]));
  assert(numbers(out[0]).join(',') === '01,02,', 'got ' + numbers(out[0]).join(','));
});

check('a subject with no modules at all survives', () => {
  const out = JSON.parse(manifestToJson([{ id: 's', name: 'S', ready: false }]));
  assert(out.length === 1 && out[0].id === 's', 'the subject was lost');
});

check('nothing but the order changes', () => {
  const before = [{
    id: 's', name: 'S', blurb: 'b', ready: true,
    modules: [
      { id: 'b', no: '02', title: 'B', total: 5, file: 'f2', format: 'json' },
      { id: 'a', no: '01', title: 'A', total: 9, file: 'f1', format: 'json', hard: true },
    ],
  }];
  const out = JSON.parse(manifestToJson(before));
  assert(out[0].name === 'S' && out[0].blurb === 'b' && out[0].ready === true, 'subject fields changed');
  assert(JSON.stringify(out[0].modules[0]) === JSON.stringify(before[0].modules[1]), 'module fields changed');
  assert(before[0].modules[0].id === 'b', 'the caller\'s own array was reordered underneath it');
});

check("the live site's own manifest sorts without losing a module", () => {
  const live = JSON.parse(execSync('git show origin/main:data/subjects.json',
    { encoding: 'utf8', maxBuffer: 1 << 26 }));
  const out = JSON.parse(manifestToJson(live));
  const count = (m) => m.reduce((n, s) => n + (s.modules || []).length, 0);
  assert(count(out) === count(live), 'module count changed: ' + count(live) + ' → ' + count(out));
  assert(out.length === live.length, 'subject count changed');
  for (const s of out) {
    const ns = (s.modules || []).map((m) => parseInt(m.no, 10)).filter((n) => !isNaN(n));
    for (let i = 1; i < ns.length; i++) {
      assert(ns[i - 1] <= ns[i], s.id + ' is still out of order: ' + ns.join(','));
    }
  }
});

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall passed\n');
process.exit(failures ? 1 : 0);

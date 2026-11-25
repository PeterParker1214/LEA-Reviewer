// Run: node tools/test-push-question.js — checks sw.js swaps reminder pushes for a question.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const handlers = {};
const sandbox = {
  self: { addEventListener: (t, f) => (handlers[t] = f), location: { origin: 'x' }, registration: { scope: '/' }, clients: {} },
  caches: {}, URL, console,
  fetch: async (u) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(root, String(u).split('?')[0]), 'utf8')) })
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8') + ';this.pushQuestion = pushQuestion;', sandbox);
(async () => {
  const msg = { title: 'Hi', body: 'admin', url: 'notifications.html?show=message' };
  assert.deepStrictEqual(await sandbox.pushQuestion(msg), msg);
  for (let i = 0; i < 300; i++) {
    const d = await sandbox.pushQuestion({ title: 'Time to study', body: 'generic', url: 'index.html' });
    assert.strictEqual(d.title, 'Time to study');
    assert.notStrictEqual(d.body, 'generic');
    assert.ok(d.body.length <= 200 && d.body.length >= 30, d.body);
    const m = d.url.match(/^index\.html\?qs=([^&]+)&qm=([^&]+)&qi=(\d+)$/); assert.ok(m, d.url);
    const subs = JSON.parse(fs.readFileSync(path.join(root, 'data/subjects.json'), 'utf8'));
    const mod = subs.find((s) => s.id === decodeURIComponent(m[1])).modules.find((x) => x.id === decodeURIComponent(m[2]));
    const q = (x => Array.isArray(x) ? x : x.questions)(JSON.parse(fs.readFileSync(path.join(root, mod.file), 'utf8')))[+m[3]];
    assert.ok((q.q || q.question).startsWith(d.body.replace(/…$/, '')), 'body is that question');
  }
  console.log('PUSH QUESTION OK');
})().catch((e) => { console.error(e); process.exit(1); });

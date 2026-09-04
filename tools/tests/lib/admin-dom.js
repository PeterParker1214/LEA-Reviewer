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
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      update: () => ({ in: async () => ({ error: null }) }),
    }),
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
    removedModuleKeys, pendingModuleArchives,
    SECTIONS, showSection, renderNav,
    get currentSectionId(){ return currentSectionId; },
    openReportCount,
    renderReportsTab,
    markReportSolved, dismissReportGroup,
    spyRenderNav(fn){ renderNav = fn; },
    spyLoadReports(fn){ loadReports = fn; },
    setReports(rows){
      openReports = rows;
      reportsByQuestionRef = {};
      rows.forEach(r => { (reportsByQuestionRef[r.question_ref] = reportsByQuestionRef[r.question_ref] || []).push(r); });
    },
  })`, ctx);

  return { dom, window: w, ctx, api };
}

module.exports = { boot, scriptBlocks };

/*
 * LEAResume — shared "resume where you left off" prompt for quiz pages.
 *
 * Any in-progress (started but not finished) attempt at a quiz is cached in
 * localStorage, namespaced by subjectId + moduleId (independent of, and in
 * addition to, the LEAProgress mastery tracker). The next time the same
 * quiz page loads with an unfinished attempt on file, a small modal asks
 * the learner whether to resume from where they left off or start over.
 * Finishing a quiz (reaching the results screen) or choosing "Start Over"
 * clears the saved attempt.
 *
 * Usage from a quiz page:
 *   LEAResume.save(subjectId, moduleId, { answeredCount, total, position, payload });
 *   LEAResume.clear(subjectId, moduleId);
 *   LEAResume.promptIfUnfinished(subjectId, moduleId, {
 *     onResume: function(payload){ ...restore state from payload... },
 *     onStartOver: function(){ ...optional, quiz is already showing q1... }
 *   });
 */
window.LEAResume = (function () {
  const STORAGE_PREFIX = 'lea_quizstate_';

  function key(subjectId, moduleId) {
    return STORAGE_PREFIX + subjectId + '_' + moduleId + '_v1';
  }

  function save(subjectId, moduleId, info) {
    try {
      localStorage.setItem(key(subjectId, moduleId), JSON.stringify({
        answeredCount: info.answeredCount,
        total: info.total,
        position: info.position,
        payload: info.payload,
        savedAt: Date.now()
      }));
    } catch (e) {}
  }

  function load(subjectId, moduleId) {
    try {
      const raw = localStorage.getItem(key(subjectId, moduleId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clear(subjectId, moduleId) {
    try { localStorage.removeItem(key(subjectId, moduleId)); } catch (e) {}
  }

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent =
      '.lea-resume-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.62);' +
      'display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;' +
      'font-family:inherit;animation:leaResumeFade .15s ease;}' +
      '@keyframes leaResumeFade{from{opacity:0;}to{opacity:1;}}' +
      // --paper-card / --ink-soft / --primary are dead tokens: no page in the
      // site defines them, so this modal always fell through to the hardcoded
      // warm-grey-and-orange defaults and matched nothing. Every page that
      // loads this script does define --bg-panel / --ink / --line / --gold,
      // so key off those and let each page's own palette (and light/dark
      // theme) apply.
      '.lea-resume-modal{background:var(--bg-panel,#0e1c28);color:var(--ink,#eef1e9);' +
      'border:1px solid var(--line,rgba(111,168,207,0.20));border-radius:10px;max-width:420px;' +
      'width:100%;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,0.5);}' +
      '.lea-resume-title{font-size:18px;font-weight:700;margin:0 0 10px;}' +
      '.lea-resume-text{font-size:14px;line-height:1.55;color:var(--muted,#8b98a5);margin:0 0 22px;}' +
      '.lea-resume-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}' +
      '.lea-resume-btn{padding:10px 18px;border-radius:5px;font-size:13px;font-weight:700;' +
      'cursor:pointer;border:1px solid var(--line,rgba(111,168,207,0.25));background:none;' +
      'color:var(--ink,#eef1e9);font-family:inherit;}' +
      '.lea-resume-btn:hover{background:rgba(255,255,255,0.08);}' +
      '.lea-resume-primary{background:var(--gold,#e0a83f);border-color:var(--gold,#e0a83f);color:#1a1206;}' +
      '.lea-resume-primary:hover{filter:brightness(1.1);background:var(--gold,#e0a83f);}';
    document.head.appendChild(s);
  }

  function showModal(cfg) {
    injectStyles();
    // Never stack: a second prompt behind the first would leave an
    // undismissable overlay if the page ever double-calls this.
    const stale = document.querySelector('.lea-resume-overlay');
    if (stale) stale.remove();
    const overlay = document.createElement('div');
    overlay.className = 'lea-resume-overlay';
    overlay.innerHTML =
      '<div class="lea-resume-modal" role="dialog" aria-modal="true">' +
        '<div class="lea-resume-title">Unfinished attempt found</div>' +
        '<div class="lea-resume-text">' + cfg.message + ' Resume where you left off, or start from the beginning?</div>' +
        '<div class="lea-resume-actions">' +
          '<button type="button" class="lea-resume-btn" id="leaResumeStartOver">Start Over</button>' +
          '<button type="button" class="lea-resume-btn lea-resume-primary" id="leaResumeContinue">Resume</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#leaResumeContinue').addEventListener('click', function () {
      overlay.remove();
      cfg.onResume();
    });
    overlay.querySelector('#leaResumeStartOver').addEventListener('click', function () {
      overlay.remove();
      cfg.onStartOver();
    });
  }

  function promptIfUnfinished(subjectId, moduleId, opts) {
    const rec = load(subjectId, moduleId);
    if (!rec || !rec.total || !(rec.answeredCount > 0) || rec.answeredCount >= rec.total) {
      if (rec) clear(subjectId, moduleId);
      return;
    }
    // Coerced to numbers before reaching the modal's innerHTML — these come
    // back out of localStorage, which anything running on the page (or a
    // browser extension) can write, and they'd otherwise be interpolated raw.
    const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const pos = num(rec.position || rec.answeredCount);
    showModal({
      message: 'You left off at question ' + pos + ' of ' + num(rec.total) + ' (' + num(rec.answeredCount) + ' answered so far).',
      onResume: function () { opts.onResume(rec.payload); },
      onStartOver: function () {
        clear(subjectId, moduleId);
        if (opts.onStartOver) opts.onStartOver();
      }
    });
  }

  return { save: save, load: load, clear: clear, promptIfUnfinished: promptIfUnfinished, key: key };
})();

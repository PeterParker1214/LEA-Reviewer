/*
 * LEAProgress — shared mastery tracker for "external module" quiz pages
 * (the pattern used by Structural, Building Utilities, Professional Practice,
 * Theory of Architecture, and any future subject built the same way).
 *
 * Each quiz question that's answered correctly at least once is "mastered".
 * Progress is namespaced by subjectId + moduleId and stored in localStorage,
 * matching the existing per-quiz pattern already used on this site (see the
 * Professional Practice SPP card) — just centralized so every subject gets
 * the same "Overall Progress" summary card, and so new modules only need a
 * couple of lines to plug in.
 *
 * To wire a new quiz module into this tracker:
 *   1. On the quiz page, include this script and set:
 *        const LEA_SUBJECT_ID = 'your-subject-id';
 *        const LEA_MODULE_ID  = 'your-module-id';
 *   2. Call LEAProgress.markMastered(LEA_SUBJECT_ID, LEA_MODULE_ID, qIndex)
 *      whenever a question is answered correctly.
 *   3. Call LEAProgress.recordRunScore(LEA_SUBJECT_ID, LEA_MODULE_ID, correct, total)
 *      when a full run finishes (for the "best score" display, if you have one).
 *
 * On the subject's index page, declare the module list and render the card:
 *   const MODULES = [{ id:'your-module-id', total:30, title:'...' }, ...];
 *   LEAProgress.renderOverallCard(document.getElementById('overallCard'), 'your-subject-id', MODULES);
 *   MODULES.forEach(m => LEAProgress.renderModuleBadge(document.getElementById('badge-'+m.id), 'your-subject-id', m.id, m.total));
 */
window.LEAProgress = (function () {
  const STORAGE_PREFIX = 'lea_progress_';

  function key(subjectId, moduleId) {
    return STORAGE_PREFIX + subjectId + '_' + moduleId + '_v1';
  }

  function load(subjectId, moduleId) {
    try {
      const raw = localStorage.getItem(key(subjectId, moduleId));
      if (raw) {
        const p = JSON.parse(raw);
        if (!Array.isArray(p.mastered)) p.mastered = [];
        return p;
      }
    } catch (e) {}
    return { mastered: [], bestCorrect: 0, bestTotal: 0, attempts: 0 };
  }

  function save(subjectId, moduleId, data) {
    try { localStorage.setItem(key(subjectId, moduleId), JSON.stringify(data)); } catch (e) {}
  }

  function markMastered(subjectId, moduleId, qIndex) {
    const p = load(subjectId, moduleId);
    if (p.mastered.indexOf(qIndex) === -1) {
      p.mastered.push(qIndex);
      save(subjectId, moduleId, p);
    }
    return p;
  }

  function recordRunScore(subjectId, moduleId, correct, total) {
    const p = load(subjectId, moduleId);
    p.attempts = (p.attempts || 0) + 1;
    if (!p.bestTotal || correct > p.bestCorrect) {
      p.bestCorrect = correct;
      p.bestTotal = total;
    }
    save(subjectId, moduleId, p);
    return p;
  }

  function reset(subjectId, moduleId) {
    try { localStorage.removeItem(key(subjectId, moduleId)); } catch (e) {}
  }

  function resetSubject(subjectId, moduleIds) {
    moduleIds.forEach(function (id) { reset(subjectId, id); });
  }

  function masteredCount(subjectId, moduleId, total) {
    const p = load(subjectId, moduleId);
    let c = p.mastered.length;
    if (total) c = Math.min(c, total);
    return c;
  }

  function subjectTotals(subjectId, modules) {
    let totalMastered = 0, totalQuestions = 0, modulesDone = 0;
    modules.forEach(function (m) {
      const c = masteredCount(subjectId, m.id, m.total);
      totalMastered += c;
      totalQuestions += m.total;
      if (m.total > 0 && c >= m.total) modulesDone++;
    });
    return { totalMastered: totalMastered, totalQuestions: totalQuestions, modulesDone: modulesDone };
  }

  function renderOverallCard(container, subjectId, modules) {
    if (!container) return;
    const t = subjectTotals(subjectId, modules);
    const pct = t.totalQuestions > 0 ? Math.round((t.totalMastered / t.totalQuestions) * 100) : 0;
    container.innerHTML =
      '<div class="overall-title"><span>Overall Progress</span>' +
      '<button class="reset-all" id="leaResetAllBtn">Reset all progress</button></div>' +
      '<div class="overall-stats-row">' +
        '<div class="overall-stat"><div class="num">' + t.totalMastered + '</div><div class="lbl">Questions mastered</div></div>' +
        '<div class="overall-stat"><div class="num">' + t.modulesDone + ' / ' + modules.length + '</div><div class="lbl">Modules fully mastered</div></div>' +
      '</div>' +
      '<div class="overall-bar-track"><div class="overall-bar-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="overall-bar-caption"><span>' + t.totalMastered + ' of ' + t.totalQuestions + ' questions mastered across all modules</span><span>' + pct + '%</span></div>';
    const btn = container.querySelector('#leaResetAllBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Reset all progress for this subject? This clears mastered questions and best scores for every module.')) {
          resetSubject(subjectId, modules.map(function (m) { return m.id; }));
          renderOverallCard(container, subjectId, modules);
          if (typeof window.leaOnProgressReset === 'function') window.leaOnProgressReset();
        }
      });
    }
  }

  function renderModuleBadge(el, subjectId, moduleId, total) {
    if (!el) return;
    const c = masteredCount(subjectId, moduleId, total);
    const pct = total > 0 ? Math.round((c / total) * 100) : 0;
    el.innerHTML =
      '<div class="mp-bar-track"><div class="mp-bar-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="mp-cap">' + c + ' / ' + total + ' mastered</div>';
  }

  return {
    load: load,
    save: save,
    markMastered: markMastered,
    recordRunScore: recordRunScore,
    reset: reset,
    resetSubject: resetSubject,
    masteredCount: masteredCount,
    subjectTotals: subjectTotals,
    renderOverallCard: renderOverallCard,
    renderModuleBadge: renderModuleBadge,
    key: key
  };
})();

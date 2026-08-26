/*
 * LEAProgress — shared mastery tracker for "external module" quiz pages
 * (the pattern used by Structural, Building Utilities, Professional Practice,
 * Theory of Architecture, and any future subject built the same way).
 *
 * Each quiz question that's answered correctly at least once is "mastered".
 * Progress is namespaced by subjectId + moduleId. It's always cached in
 * localStorage (so the badges paint instantly and guests/offline still
 * work), and — once a signed-in session is available — it's also synced to
 * the same `progress` table (one JSON blob per user, namespaced by subject)
 * that Building Laws and History already use. That's what lets a subject
 * built on LEAProgress plug into the site-wide dashboard and the
 * get_leaderboard() RPC for free, with no per-subject sync code and no new
 * tables — same pattern, same table, just read/written by more pages now.
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
 *
 * Sync starts itself as soon as this script loads — nothing extra to call.
 * A page only needs to react to it if it wants to re-render the moment
 * remote data lands; the existing `window.leaOnProgressReset` hook (already
 * defined on every page that uses this tracker, for the "reset all" button)
 * doubles as that signal, so no new hook is needed either.
 */
window.LEAProgress = (function () {
  const STORAGE_PREFIX = 'lea_progress_';
  const SUPABASE_URL = 'https://rjrrprbvsmflzncojbtq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_NcOypGF5CxQgEoNWjYqOnQ_oO3NR_1Y';

  function key(subjectId, moduleId) {
    return STORAGE_PREFIX + subjectId + '_' + moduleId + '_v1';
  }

  function loadLocal(subjectId, moduleId) {
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

  function saveLocal(subjectId, moduleId, data) {
    try { localStorage.setItem(key(subjectId, moduleId), JSON.stringify(data)); } catch (e) {}
  }

  // ---- Remote sync (mirrors the Building Laws / History `progress` row) ----
  let sbClient = null;
  let syncUser = null;
  let fullData = null;       // whole multi-subject blob once loaded; null until a session syncs
  let saveTimer = null;
  let lastRenderCtx = null;  // {subjectId, moduleIds} from the most recent renderOverallCard call

  function ensureSbLib(cb) {
    if (window.supabase && window.supabase.createClient) { cb(); return; }
    const existing = document.querySelector('script[data-lea-supabase-lib]');
    if (existing) { existing.addEventListener('load', cb); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.setAttribute('data-lea-supabase-lib', '1');
    s.onload = cb;
    document.head.appendChild(s);
  }

  function getClient() {
    if (!window.supabase || !window.supabase.createClient) return null;
    sbClient = window.__leaSharedClient = window.__leaSharedClient ||
      window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sbClient;
  }

  // Generic, module-shape-agnostic totals across ALL subjects in the row —
  // kept as top-level columns for reference, same as Building Laws does.
  // Leaderboards themselves read live from the `data` JSON via the RPC.
  function computeGlobalTotals(full) {
    let totalMastered = 0, scoreSum = 0, scoreCount = 0;
    Object.entries(full || {}).forEach(function ([subjId, subjectData]) {
      if (subjId === '__meta') return;
      Object.values(subjectData || {}).forEach(function (mp) {
        totalMastered += (mp.mastered || []).length;
        if (mp.bestTotal > 0) { scoreSum += (mp.bestCorrect / mp.bestTotal); scoreCount++; }
      });
    });
    return { totalMastered: totalMastered, avgScore: scoreCount > 0 ? (scoreSum / scoreCount) : 0 };
  }

  function pushRemote() {
    if (!syncUser || !sbClient || !fullData) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      const totals = computeGlobalTotals(fullData);
      sbClient.from('progress').upsert({
        user_id: syncUser.id,
        data: fullData,
        total_mastered: totals.totalMastered,
        avg_best_score: totals.avgScore,
        updated_at: new Date().toISOString()
      }).then(function () {});
    }, 600);
  }

  // One-time catch-up for a browser that built up local progress before this
  // subject synced: fold anything richer on the local side into fullData.
  // Doesn't clobber remote progress that's already ahead (e.g. from another
  // device) — takes the union of mastered questions and the better best score.
  function migrateLocalIntoRemote(subjectId, moduleIds) {
    if (!fullData) return false;
    let changed = false;
    if (!fullData[subjectId]) fullData[subjectId] = {};
    moduleIds.forEach(function (moduleId) {
      const local = loadLocal(subjectId, moduleId);
      const localHasProgress = (local.mastered && local.mastered.length > 0) || local.bestTotal > 0;
      if (!localHasProgress) return;
      const remote = fullData[subjectId][moduleId];
      if (!remote) {
        fullData[subjectId][moduleId] = local;
        changed = true;
        return;
      }
      const mergedMastered = Array.from(new Set((remote.mastered || []).concat(local.mastered || [])));
      const localBetter = (local.bestCorrect || 0) > (remote.bestCorrect || 0);
      if (mergedMastered.length !== (remote.mastered || []).length || localBetter) {
        fullData[subjectId][moduleId] = {
          mastered: mergedMastered,
          bestCorrect: localBetter ? local.bestCorrect : remote.bestCorrect,
          bestTotal: localBetter ? local.bestTotal : remote.bestTotal,
          attempts: Math.max(remote.attempts || 0, local.attempts || 0)
        };
        changed = true;
      }
    });
    return changed;
  }

  function runPendingMigration() {
    if (!lastRenderCtx || !fullData) return;
    if (migrateLocalIntoRemote(lastRenderCtx.subjectId, lastRenderCtx.moduleIds)) pushRemote();
  }

  function loadRow(user) {
    syncUser = user;
    // maybeSingle(), not single(): a missing row must be distinguishable from
    // a failed read. single() reports both as an error with data:null, so a
    // transient network blip or RLS hiccup looked exactly like a brand-new
    // user — fullData was set to {}, every read went empty, and the next
    // write upserted that empty blob straight over the real row, wiping all
    // of the user's progress on every device. maybeSingle() gives
    // {data:null, error:null} only when the row genuinely isn't there.
    sbClient.from('progress').select('data').eq('user_id', user.id).maybeSingle().then(function (res) {
      if (res && res.error) {
        // Couldn't read it. Leave fullData null so reads fall back to the
        // local cache and nothing can push over remote progress we haven't
        // seen. The next sign-in or page load retries.
        return;
      }
      if (res && res.data) {
        fullData = res.data.data || {};
      } else {
        fullData = {};
        sbClient.from('progress').insert({ user_id: user.id, data: {} }).then(function () {});
      }
      runPendingMigration();
      if (typeof window.leaOnProgressReset === 'function') window.leaOnProgressReset();
    });
  }

  let syncStarted = false;
  function initSync() {
    if (syncStarted) return;
    syncStarted = true;
    ensureSbLib(function () {
      const sb = getClient();
      if (!sb) return;
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_IN' && session) loadRow(session.user);
        if (event === 'SIGNED_OUT') { syncUser = null; fullData = null; }
      });
      sb.auth.getSession().then(function (res) {
        const session = res && res.data && res.data.session;
        if (session) loadRow(session.user);
      });
    });
  }

  // ---- Public, sync-aware read/write (same signatures as before) ----
  function load(subjectId, moduleId) {
    if (fullData) {
      if (!fullData[subjectId]) fullData[subjectId] = {};
      const p = fullData[subjectId][moduleId];
      if (p) return p;
      return { mastered: [], bestCorrect: 0, bestTotal: 0, attempts: 0 };
    }
    return loadLocal(subjectId, moduleId);
  }

  function save(subjectId, moduleId, data) {
    saveLocal(subjectId, moduleId, data); // keep the local cache warm regardless
    if (fullData) {
      if (!fullData[subjectId]) fullData[subjectId] = {};
      fullData[subjectId][moduleId] = data;
      pushRemote();
    }
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
    if (fullData && fullData[subjectId]) {
      delete fullData[subjectId][moduleId];
      pushRemote();
    }
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
    lastRenderCtx = { subjectId: subjectId, moduleIds: modules.map(function (m) { return m.id; }) };
    if (fullData && migrateLocalIntoRemote(subjectId, lastRenderCtx.moduleIds)) pushRemote();
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

  initSync();

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
    key: key,
    initSync: initSync
  };
})();

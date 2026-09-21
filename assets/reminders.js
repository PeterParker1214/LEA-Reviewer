/*
 * Reminders: study nudges worked out on the reader's device and shown in the
 * notifications bell (kind 'reminder'). Nothing is stored per reminder; each
 * one has an id that includes the day or milestone, so it comes back as unread
 * when it is new again.
 *
 *   daily  - today's Daily Drill is not done yet
 *   streak - in the evening, when the streak ends at midnight
 *   exam   - exam countdown milestones
 *   rivals - someone passed you on this week's board, or who to catch next
 *   focus  - weakest subject and the module to open next
 *   update - the site has a newer version than the one this page loaded
 *
 * Which ones a reader wants is saved in their progress (meta key
 * 'reminderPrefs'), so the choice follows them across devices.
 *
 * RELEASE STEP: see assets/whats-new.js. BUILD must equal the newest published
 * build in data/changelog.json.
 */
(function(){
  'use strict';
  const BUILD = 16;
  const EXAM_MILESTONES = [180, 120, 90, 60, 30, 14, 7, 3, 1];
  const DEFAULT_PREFS = { daily:true, streak:true, exam:true, rivals:true, focus:true, update:true };
  const TYPES = [
    { id:'daily',  label:'Daily Drill nudge',    sub:'When today’s Daily Drill is not done yet' },
    { id:'streak', label:'Streak at risk',       sub:'From 6 PM, when your streak would end at midnight' },
    { id:'exam',   label:'Exam countdown',       sub:'At 180, 120, 90, 60, 30, 14, 7, 3 and 1 day left' },
    { id:'rivals', label:'Leaderboard rivals',   sub:'When someone passes you on this week’s board, and who to catch' },
    { id:'focus',  label:'What to study next',   sub:'Your weakest subject and the module to open' },
    { id:'update', label:'New version out',      sub:'When the site has updated and you should refresh' }
  ];

  let subjectsPromise = null;
  function loadSubjects(){
    if(!subjectsPromise){
      subjectsPromise = fetch('data/subjects.json', { cache:'no-cache' })
        .then(r => r.json()).then(s => Array.isArray(s) ? s : []).catch(() => []);
    }
    return subjectsPromise;
  }

  function prefs(){
    const saved = window.LEAProgress ? LEAProgress.loadMeta('reminderPrefs') : null;
    return Object.assign({}, DEFAULT_PREFS, saved || {});
  }
  function savePrefs(p){ if(window.LEAProgress) LEAProgress.saveMeta('reminderPrefs', p); }

  function dateStr(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function startOfToday(){ const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
  function plainName(name){ return String(name || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{200D}\u{FE0F}]+/gu, '').trim(); }

  function reminder(type, id, title, body, extra){
    return Object.assign({ kind:'reminder', type, id: type + ':' + id, title, body, at: startOfToday() }, extra || {});
  }

  // ---- daily + streak ----
  function drillReminders(p){
    if(!window.LEAProgress) return [];
    const streak = LEAProgress.loadMeta('streak') || { current:0, lastCompletedDate:null };
    const today = dateStr(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    if(streak.lastCompletedDate === today) return [];
    const alive = (streak.current || 0) > 0 && streak.lastCompletedDate === dateStr(y);
    const href = 'run.html?mode=daily-drill';
    if(p.streak && alive && new Date().getHours() >= 18){
      return [reminder('streak', today,
        'Your ' + streak.current + '-day streak ends at midnight',
        'Finish today’s Daily Drill before midnight to keep it going.', { href })];
    }
    if(p.daily){
      return [reminder('daily', today, 'Today’s Daily Drill is waiting',
        alive ? 'Keep your ' + streak.current + '-day streak going.'
              : 'Up to 20 questions from what you keep missing and what you have not tried yet.',
        { href })];
    }
    return [];
  }

  // ---- exam countdown ----
  function examReminders(){
    if(!window.LEACountdown) return [];
    const days = Math.ceil(LEACountdown.parts().diff / 86400000);
    if(days <= 0) return [];
    const reached = EXAM_MILESTONES.filter(m => days <= m);
    if(!reached.length) return [];
    const milestone = reached[reached.length - 1];
    const at = new Date(LEACountdown.EXAM_DATE.getTime() - milestone * 86400000).toISOString();
    return [reminder('exam', String(milestone),
      days + (days === 1 ? ' day' : ' days') + ' to the board exam',
      'The exam is on ' + LEACountdown.label + '. ' + (days <= 14 ? 'Focus on your weakest subjects now.' : 'Keep a steady pace.'),
      { at, href:'index.html' })];
  }

  // ---- what to study next ----
  async function focusReminders(){
    if(!window.LEAProgress) return [];
    const subjects = (await loadSubjects()).filter(s => s.ready && (s.modules || []).length);
    let pick = null;
    subjects.forEach(s => {
      let mastered = 0, total = 0, touched = false;
      s.modules.forEach(m => {
        const pr = LEAProgress.load(s.id, m.id);
        mastered += Math.min((pr.mastered || []).length, m.total || 0);
        total += m.total || 0;
        if((pr.attempts || 0) > 0) touched = true;
      });
      if(!total || mastered >= total) return;
      const pct = mastered / total;
      // Subjects already started come first: a nudge back to one you left is
      // more useful than a pointer at one you never opened.
      const score = (touched ? 0 : 1) + pct;
      if(!pick || score < pick.score) pick = { s, pct, score };
    });
    if(!pick) return [];

    // A module already started with the most left to master; failing that, the
    // first module not yet started, in the subject's own order.
    const candidates = pick.s.modules.map(m => {
      const pr = LEAProgress.load(pick.s.id, m.id);
      const done = Math.min((pr.mastered || []).length, m.total || 0);
      return { m, started: (pr.attempts || 0) > 0, remaining: (m.total || 0) - done };
    }).filter(c => c.remaining > 0);
    candidates.sort((a, b) => (b.started - a.started) || (a.started ? b.remaining - a.remaining : 0));
    const mod = candidates[0];
    if(!mod) return [];
    const left = mod.remaining;
    const name = plainName(pick.s.name);
    return [reminder('focus', dateStr(new Date()) + ':' + pick.s.id + ':' + mod.m.id,
      'Study next: ' + name,
      'You have mastered ' + Math.round(pick.pct * 100) + '% of ' + name + '. Open “' + mod.m.title + '” — ' + left + ' question' + (left === 1 ? '' : 's') + ' left to master.',
      { href:'run.html?s=' + encodeURIComponent(pick.s.id) + '&m=' + encodeURIComponent(mod.m.id) })];
  }

  // ---- leaderboard rivals ----
  async function rivalReminders(sb, userId){
    const [{ data: prof }, { data: board, error }] = await Promise.all([
      sb.from('profiles').select('username').eq('id', userId).maybeSingle(),
      sb.rpc('get_weekly_leaderboard', { p_days: 7 })
    ]);
    if(error || !prof || !prof.username) return [];
    const rows = (board && board.rows) || [];
    const idx = rows.findIndex(r => r.username === prof.username);
    if(idx < 0) return [];

    const today = dateStr(new Date());
    const key = 'lea_rival_state_' + userId;
    let state = null;
    try{ state = JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){}
    const above = rows.slice(0, idx).map(r => r.username);
    const out = [];

    let passed = state && state.passed && state.passed.day === today ? state.passed : null;
    if(state && Array.isArray(state.above)){
      const newcomers = above.filter(u => state.above.indexOf(u) === -1);
      if(newcomers.length){
        passed = {
          day: today,
          id: today + ':' + newcomers.join(','),
          title: newcomers[0] + (newcomers.length > 1 ? ' and ' + (newcomers.length - 1) + ' more' : '') + ' passed you on this week’s board',
          body: 'You are now #' + (idx + 1) + ' this week. Master a few more questions to take your spot back.'
        };
      }
    }
    try{ localStorage.setItem(key, JSON.stringify({ above, day: today, passed })); }catch(e){}
    if(passed) out.push(reminder('rivals', 'passed:' + passed.id, passed.title, passed.body, { href:'standings.html' }));

    if(idx > 0){
      const rival = rows[idx - 1];
      const gap = (rival.mastered || 0) - (rows[idx].mastered || 0) + 1;
      out.push(reminder('rivals', 'chase:' + today + ':' + rival.username,
        'Catch ' + rival.username + ' for #' + idx,
        'Master ' + gap + ' more question' + (gap === 1 ? '' : 's') + ' this week to pass them.',
        { href:'standings.html' }));
    }
    return out;
  }

  // ---- new version ----
  async function updateReminders(){
    const res = await fetch('data/changelog.json', { cache:'no-store' });
    if(!res.ok) return [];
    const published = (await res.json()).filter(v => v.draft !== true);
    const latest = published.length ? Number(published[0].build) : 0;
    if(!(latest > BUILD)) return [];
    return [reminder('update', String(latest), 'A new version of the site is out',
      'Refresh to load the latest fixes and features.', { action:'refresh', at: new Date().toISOString() })];
  }

  // Clears the service worker's caches and reloads, so every page and script is
  // fetched again. Progress is not in these caches, so nothing is lost.
  async function hardRefresh(){
    try{
      if('serviceWorker' in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(() => null)));
      }
      if(window.caches){
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    }catch(e){}
    location.reload();
  }

  async function load(sb, userId){
    const p = prefs();
    const jobs = [];
    const guard = fn => Promise.resolve().then(fn).catch(() => []);
    jobs.push(guard(() => drillReminders(p)));
    if(p.exam) jobs.push(guard(examReminders));
    if(p.focus) jobs.push(guard(focusReminders));
    if(p.rivals && sb && userId) jobs.push(guard(() => rivalReminders(sb, userId)));
    if(p.update) jobs.push(guard(updateReminders));
    return [].concat(...await Promise.all(jobs));
  }

  if(window.LEANotify) LEANotify.registerSource('reminders', load);
  window.LEAReminders = { BUILD, TYPES, prefs, savePrefs, load, hardRefresh };
})();

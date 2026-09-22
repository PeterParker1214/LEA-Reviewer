/*
 * Notifications: one list for everything the site wants to tell a reader.
 *
 *   message  - posted by an admin to everyone (public.messages)
 *   report   - an admin reply to, or fix of, a question the reader reported
 *   update   - a new version of the site (added by the What's New feature)
 *   reminder - study nudges (added by the Reminders feature)
 *
 * Messages and reports come from Supabase. Updates and reminders plug in
 * through LEANotify.registerSource(), so those features can ship on their own.
 * Read state lives in public.notification_reads, except report replies, which
 * already use reports.seen_by_reporter.
 */
(function(){
  'use strict';
  // presence.js may load this file a second time; keep the first copy, which
  // already holds the registered sources.
  if(window.LEANotify) return;
  const sources = [];
  const BADGE_KEY = 'lea_notify_unread';

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadMessages(sb){
    const { data, error } = await sb.from('messages')
      .select('id,title,body,link,created_at')
      .order('created_at', { ascending:false })
      .limit(50);
    if(error) throw error;
    return (data || []).map(m => ({
      kind:'message', id:String(m.id), title:m.title, body:m.body,
      href:m.link || null, at:m.created_at
    }));
  }

  async function loadReports(sb, userId){
    const { data, error } = await sb.from('reports')
      .select('id,question_ref,status,admin_reply,replied_at,resolved_at,seen_by_reporter')
      .eq('user_id', userId)
      .or('admin_reply.not.is.null,status.eq.solved')
      .order('created_at', { ascending:false })
      .limit(50);
    if(error) throw error;
    // Several reports on one question carry the same reply; show it once.
    const seen = new Map();
    (data || []).forEach(r => {
      const key = r.question_ref + '|' + (r.admin_reply || '') + '|' + r.status;
      const prev = seen.get(key);
      if(prev){ prev.unread = prev.unread || !r.seen_by_reporter; return; }
      const parts = String(r.question_ref || '').split('/');
      const qNo = parts.length === 3 ? Number(parts[2]) + 1 : null;
      const fixed = r.status === 'solved';
      seen.set(key, {
        kind:'report', id:String(r.id),
        title: fixed ? 'A question you reported was fixed' : 'Reply to your report',
        body: r.admin_reply || 'This question has been corrected. Thanks for flagging it.',
        where: qNo ? 'Question ' + qNo : '',
        href: parts.length === 3 ? 'run.html?s=' + encodeURIComponent(parts[0]) + '&m=' + encodeURIComponent(parts[1]) : null,
        at: r.replied_at || r.resolved_at,
        unread: !r.seen_by_reporter
      });
    });
    return Array.from(seen.values());
  }

  // A duel that is waiting on you: a challenge you have not answered, or one
  // you accepted and have not played. Nothing is said about duels waiting on
  // the other person — that is not news to you.
  async function loadDuels(sb, userId){
    const { data, error } = await sb.from('duels')
      .select('id,challenger,opponent,challenger_score,opponent_score,status,created_at')
      .or('challenger.eq.' + userId + ',opponent.eq.' + userId)
      .neq('status', 'declined')
      .order('created_at', { ascending:false })
      .limit(50);
    if(error) throw error;
    const names = new Map();
    const ids = Array.from(new Set((data || []).map(d => d.challenger === userId ? d.opponent : d.challenger)));
    if(ids.length){
      const { data: people } = await sb.from('profiles').select('id,username').in('id', ids);
      (people || []).forEach(p => names.set(p.id, p.username));
    }
    return (data || []).filter(d => {
      const mine = d.challenger === userId ? d.challenger_score : d.opponent_score;
      const theirs = d.challenger === userId ? d.opponent_score : d.challenger_score;
      if(mine != null) return false;                       // you have played yours
      if(d.status === 'pending' && d.challenger === userId) return false; // waiting on them to accept
      if(d.status === 'pending' && Date.now() - new Date(d.created_at) > 3 * 86400000) return false; // expired
      return theirs != null || d.status !== 'pending' || d.opponent === userId;
    }).map(d => {
      const who = names.get(d.challenger === userId ? d.opponent : d.challenger) || 'Someone';
      const invited = d.status === 'pending';
      return {
        kind:'duel', id:String(d.id),
        title: invited ? who + ' challenged you to a duel' : 'Your duel with ' + who + ' is waiting',
        body: invited ? 'Ten questions, the same ten for both of you.' : 'You have not answered your ten yet.',
        href: 'duel.html?d=' + encodeURIComponent(d.id),
        at: d.created_at
      };
    });
  }

  async function loadReads(sb, userId){
    const { data, error } = await sb.from('notification_reads').select('kind,ref_id').eq('user_id', userId);
    if(error) throw error;
    return new Set((data || []).map(r => r.kind + ':' + r.ref_id));
  }

  // Loads every notification, newest first. A source that fails is skipped
  // rather than emptying the whole list; `errors` says which ones failed.
  async function load(sb, userId){
    const errors = [];
    const safe = (name, p) => Promise.resolve(p).catch(e => { errors.push(name + ': ' + (e.message || e)); return []; });
    const [messages, reports, duels, reads, ...extra] = await Promise.all([
      safe('messages', loadMessages(sb)),
      safe('reports', loadReports(sb, userId)),
      safe('duels', loadDuels(sb, userId)),
      loadReads(sb, userId).catch(e => { errors.push('read state: ' + (e.message || e)); return new Set(); }),
      ...sources.map(s => safe(s.name, s.load(sb, userId)))
    ]);
    const items = [].concat(messages, reports, duels, ...extra);
    items.forEach(item => {
      if(item.unread === undefined) item.unread = !reads.has(item.kind + ':' + item.id);
    });
    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const unread = items.filter(i => i.unread).length;
    try{ sessionStorage.setItem(BADGE_KEY, String(unread)); }catch(e){}
    return { items, unread, errors };
  }

  async function markRead(sb, userId, items){
    const unread = items.filter(i => i.unread);
    const rows = unread.filter(i => i.kind !== 'report').map(i => ({ user_id:userId, kind:i.kind, ref_id:i.id }));
    const jobs = [];
    if(rows.length) jobs.push(sb.from('notification_reads').upsert(rows, { onConflict:'user_id,kind,ref_id', ignoreDuplicates:true }));
    if(unread.some(i => i.kind === 'report')) jobs.push(sb.rpc('mark_reports_seen'));
    await Promise.all(jobs.map(j => Promise.resolve(j).catch(() => null)));
    try{ sessionStorage.setItem(BADGE_KEY, '0'); }catch(e){}
  }

  function paintCount(el, n){
    if(!el) return;
    el.textContent = n > 9 ? '9+' : String(n);
    el.hidden = !(n > 0);
  }

  // ---- Pop-up toasts for new notifications, on whatever page is open ----
  const TOASTED_KEY = 'lea_notify_toasted';
  const KIND_LABEL = { message:'Message', report:'Report', update:'Update', reminder:'Reminder', duel:'Duel' };
  let watching = false;
  let lastTick = 0;

  function injectToastCss(){
    if(document.getElementById('leaToastCss')) return;
    const s = document.createElement('style');
    s.id = 'leaToastCss';
    s.textContent =
      '.lea-toast{position:fixed;top:12px;left:50%;z-index:6000;width:min(420px,calc(100% - 24px));transform:translate(-50%,-150%);' +
        'transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .2s linear;display:block;text-decoration:none;color:var(--ink,#eef1e9);' +
        'background:var(--bg-panel,#0e1c28);border:1px solid var(--line,rgba(111,168,207,.2));border-left:3px solid var(--gold,#e0a83f);' +
        'border-radius:12px;padding:11px 14px;touch-action:pan-y;box-shadow:0 10px 30px rgba(0,0,0,.45);font-family:var(--font-body,system-ui,sans-serif);}' +
      '.lea-toast.in{transform:translate(-50%,0);}' +
      '.lea-toast-kicker{display:block;font-family:var(--font-mono,monospace);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--gold-bright,#f0c268);margin-bottom:2px;}' +
      '.lea-toast-title{display:block;font-weight:600;font-size:14px;line-height:1.35;}' +
      '.lea-toast-body{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;line-height:1.45;opacity:.85;margin-top:2px;white-space:pre-line;}' +
      '@media (prefers-reduced-motion: reduce){.lea-toast{transition:none;}}';
    document.head.appendChild(s);
  }

  // Swipe (or drag) the toast sideways or up to dismiss it. A move under
  // 10px is still a tap, so the link keeps working.
  function swipeToDismiss(el){
    let x0 = 0, y0 = 0, dx = 0, dy = 0, down = false;
    el.addEventListener('pointerdown', e => {
      down = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
      el.style.transition = 'none';
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if(!down) return;
      dx = e.clientX - x0; dy = Math.min(0, e.clientY - y0);
      el.style.transform = 'translate(calc(-50% + ' + dx + 'px),' + dy + 'px)';
      el.style.opacity = String(Math.max(0, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 200));
    });
    const up = () => {
      if(!down) return;
      down = false;
      el.style.transition = '';
      const sideways = Math.abs(dx) > 70;
      if(sideways || dy < -50){
        el.style.transform = sideways
          ? 'translate(calc(-50% + ' + (dx > 0 ? 400 : -400) + 'px),0)'
          : 'translate(-50%,-200px)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      } else {
        el.style.transform = ''; el.style.opacity = '';
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // A drag must not follow the link.
    el.addEventListener('click', e => { if(Math.abs(dx) > 10 || Math.abs(dy) > 10) e.preventDefault(); });
  }

  function toast(items){
    injectToastCss();
    const one = items.length === 1 ? items[0] : null;
    // Only same-site pages open straight from the toast; anything else goes
    // through the notifications page, which handles outside links safely.
    const href = one && one.href && /^[\w-]+\.html(\?|$)/.test(one.href) ? one.href : 'notifications.html';
    document.querySelectorAll('.lea-toast').forEach(t => t.remove());
    const el = document.createElement('a');
    el.className = 'lea-toast';
    el.href = href;
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="lea-toast-kicker">' + (one ? KIND_LABEL[one.kind] || 'Notification' : 'Notifications') + '</span>' +
      '<span class="lea-toast-title">' + escapeHtml(one ? one.title : items.length + ' new notifications') + '</span>' +
      (one && one.body ? '<span class="lea-toast-body">' + escapeHtml(one.body) + '</span>' : '');
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    const hide = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 350); };
    swipeToDismiss(el);
    setTimeout(hide, 8000);
  }

  // Checks every five minutes while the tab is visible (and on coming back to it).
  // Each unread item pops up once per device; a backlog, such as a first
  // visit, becomes one summary toast. onCount receives the unread total.
  function watch(sb, onCount){
    if(watching) return;
    watching = true;
    const tick = async () => {
      if(document.hidden || Date.now() - lastTick < 60000) return;
      lastTick = Date.now();
      try{
        const { data: { session } } = await sb.auth.getSession();
        if(!session) return;
        const { items, unread } = await load(sb, session.user.id);
        if(onCount) onCount(unread);
        if(/notifications\.html$/.test(location.pathname)) return;
        let done = [];
        try{ done = JSON.parse(localStorage.getItem(TOASTED_KEY) || '[]'); }catch(e){}
        const fresh = items.filter(i => i.unread && done.indexOf(i.kind + ':' + i.id) === -1);
        if(!fresh.length) return;
        done = done.concat(fresh.map(i => i.kind + ':' + i.id)).slice(-300);
        try{ localStorage.setItem(TOASTED_KEY, JSON.stringify(done)); }catch(e){}
        toast(fresh);
      }catch(e){ /* a toast is never worth breaking the page for */ }
    };
    tick();
    setInterval(tick, 300000);
    document.addEventListener('visibilitychange', tick);
  }

  function bellSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  }

  function registerSource(name, loadFn){ sources.push({ name, load:loadFn }); }

  window.LEANotify = { load, markRead, watch, bellSvg, registerSource, escapeHtml };
})();

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
    const [messages, reports, reads, ...extra] = await Promise.all([
      safe('messages', loadMessages(sb)),
      safe('reports', loadReports(sb, userId)),
      loadReads(sb, userId).catch(e => { errors.push('read state: ' + (e.message || e)); return new Set(); }),
      ...sources.map(s => safe(s.name, s.load(sb, userId)))
    ]);
    const items = [].concat(messages, reports, ...extra);
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

  // Paints the cached count at once, then the real one when it arrives.
  async function paintBadge(sb, userId, el){
    try{ paintCount(el, Number(sessionStorage.getItem(BADGE_KEY) || 0)); }catch(e){}
    try{ const { unread } = await load(sb, userId); paintCount(el, unread); }catch(e){}
  }

  function bellSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  }

  function registerSource(name, loadFn){ sources.push({ name, load:loadFn }); }

  window.LEANotify = { load, markRead, paintBadge, bellSvg, registerSource, escapeHtml };
})();

/*
 * What's New: the version history in data/changelog.json (newest first).
 *   popup()     - on Home, shows versions newer than the last one this device saw
 *   listHtml()  - the full history, for Profile's Versions tab
 * It also feeds the notifications bell (kind 'update').
 *
 * WHEN TO ANNOUNCE
 * Not every push is a version. Small pushes add their lines to the top entry
 * with "draft": true — readers see nothing. When the draft adds up to something
 * worth telling readers about, remove "draft": true from the top entry in data/changelog.json
 *   1. delete "draft": true from the top entry in data/changelog.json
 *   2. set BUILD in assets/reminders.js to that entry's build
 *   3. run python tools/bump-assets.py, then push
 * Publishing triggers the popup, the bell, and the "refresh" reminder at once.
 * Start the next draft with build + 1.
 */
(function(){
  'use strict';
  const SEEN_KEY = 'lea_seen_build';
  let changelogPromise = null;
  let popupOpen = false;

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  }

  function load(){
    if(!changelogPromise){
      changelogPromise = fetch('data/changelog.json', { cache:'no-cache' })
        .then(r => r.ok ? r.json() : [])
        .then(v => Array.isArray(v) ? v.filter(entry => entry.draft !== true) : [])
        .catch(() => []);
    }
    return changelogPromise;
  }

  function fmtDate(d){
    const date = new Date(d + 'T12:00:00+08:00');
    return isNaN(date) ? '' : date.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  }

  function injectCss(){
    if(document.getElementById('wnCss')) return;
    const style = document.createElement('style');
    style.id = 'wnCss';
    style.textContent =
      '.wn-version{background:var(--bg-panel-2);border:1px solid var(--line);border-radius:0;padding:14px 16px;margin-bottom:8px;text-align:left;}' +
      '.wn-top{display:flex;gap:8px;align-items:center;font-family:var(--font-body);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px;}' +
      '.wn-tag{color:var(--gold-bright);font-weight:600;}' +
      '.wn-title{font-family:var(--font-display);font-weight:800;font-size:20px;line-height:1.1;text-transform:uppercase;color:var(--ink);margin-bottom:8px;text-wrap:balance;}' +
      '.wn-items{margin:0;padding-left:18px;color:var(--ink);font-family:var(--font-body);font-size:14px;line-height:1.55;}' +
      '.wn-items li{margin-bottom:4px;overflow-wrap:anywhere;}' +
      '.wn-overlay{position:fixed;inset:0;z-index:5000;background:rgba(4,8,12,.62);display:flex;align-items:center;justify-content:center;padding:16px;overscroll-behavior:contain;}' +
      '.wn-sheet{position:relative;box-sizing:border-box;width:min(440px,100%);height:min(560px,calc(100vh - 32px));height:min(560px,calc(100dvh - 32px));display:flex;flex-direction:column;background:var(--bg-panel);border:1px solid var(--line);border-radius:0;box-shadow:0 18px 50px rgba(0,0,0,.5);}' +
      '.wn-sheet::before,.wn-sheet::after{content:"";position:absolute;width:12px;height:12px;border:2px solid var(--gold);pointer-events:none;}' +
      '.wn-sheet::before{top:-2px;left:-2px;border-width:2px 0 0 2px;}' +
      '.wn-sheet::after{bottom:-2px;right:-2px;border-width:0 2px 2px 0;}' +
      '.wn-top-bar{flex:none;padding:16px 16px 12px;border-bottom:1px solid var(--line);}' +
      '.wn-kicker{font-family:var(--font-body);font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-bright);margin-bottom:6px;}' +
      '.wn-head{font-family:var(--font-display);font-weight:800;font-size:28px;line-height:1;text-transform:uppercase;color:var(--ink);margin:0;text-wrap:balance;}' +
      '.wn-scroll{flex:1;min-height:0;overflow-y:auto;padding:12px 16px 4px;overscroll-behavior:contain;}' +
      '.wn-actions{flex:none;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 16px 16px;border-top:1px solid var(--line);}' +
      '.wn-actions a{display:flex;align-items:center;min-height:44px;font-family:var(--font-body);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold-bright);text-decoration:none;}' +
      '.wn-ok{min-height:44px;background:var(--gold);color:#1a1206;border:none;border-radius:0;padding:0 24px;font-family:var(--font-body);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}' +
      '.wn-ok:hover{background:var(--gold-bright);}';
    document.head.appendChild(style);
  }

  function versionHtml(v){
    return '<div class="wn-version">' +
      '<div class="wn-top"><span class="wn-tag">v' + esc(v.version) + '</span><span>' + fmtDate(v.date) + '</span></div>' +
      '<div class="wn-title">' + esc(v.title) + '</div>' +
      '<ul class="wn-items">' + (v.items || []).map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
    '</div>';
  }

  function listHtml(versions){
    injectCss();
    return versions.map(versionHtml).join('');
  }

  function markSeen(build){ try{ localStorage.setItem(SEEN_KEY, String(build)); }catch(e){} }

  async function popup(){
    if(popupOpen) return;
    popupOpen = true;
    const versions = await load();
    let seen = 0;
    try{ seen = Number(localStorage.getItem(SEEN_KEY) || 0); }catch(e){}
    const latest = versions.length ? versions[0].build : 0;
    if(!latest || seen >= latest){ popupOpen = false; return; }

    injectCss();
    const overlay = document.createElement('div');
    overlay.className = 'wn-overlay';
    overlay.innerHTML =
      '<div class="wn-sheet" role="dialog" aria-modal="true" aria-labelledby="wnHead">' +
        '<div class="wn-top-bar"><div class="wn-kicker">Since your last visit</div>' +
          '<h2 class="wn-head" id="wnHead">What’s new</h2></div>' +
        '<div class="wn-scroll">' + versions.filter(v => v.build > seen).slice(0, 3).map(versionHtml).join('') + '</div>' +
        '<div class="wn-actions"><a href="profile.html?tab=versions">All versions</a><button type="button" class="wn-ok">Got it</button></div>' +
      '</div>';
    const close = () => {
      markSeen(latest);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      popupOpen = false;
    };
    const onKey = e => { if(e.key === 'Escape') close(); };
    overlay.addEventListener('click', e => { if(e.target === overlay || e.target.closest('.wn-ok')) close(); });
    overlay.querySelector('a').addEventListener('click', () => markSeen(latest));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('.wn-ok').focus();
  }

  if(window.LEANotify){
    LEANotify.registerSource('updates', async () => (await load()).slice(0, 5).map(v => ({
      kind:'update', id:String(v.build),
      title:'Version ' + v.version + ': ' + v.title,
      body:(v.items || []).map(i => '• ' + i).join('\n'),
      at:v.date + 'T12:00:00+08:00',
      href:'profile.html?tab=versions'
    })));
  }

  window.LEAWhatsNew = { load, popup, listHtml };
})();

/* Home-only security/convenience enhancements. Kept here because this asset is
   already loaded on Home before the auth UI initializes, avoiding another
   blocking script while leaving admin authorization on Supabase/RLS. */
(function(){
  'use strict';
  let isAdmin = false;

  async function resolveAdmin(session){
    try{
      if(!session || typeof sb === 'undefined') return false;
      const { data, error } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
      return !error && !!(data && data.is_admin === true);
    }catch(e){ return false; }
  }

  function hardenSignupForm(){
    const pw = document.getElementById('signupPassword');
    const form = document.getElementById('signupForm');
    if(!pw || !form) return;
    pw.minLength = 10;
    pw.placeholder = 'At least 10 characters';
    form.addEventListener('submit', function(e){
      if((pw.value || '').length >= 10) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const err = document.getElementById('signupError');
      if(err) err.textContent = 'Use at least 10 characters for your password.';
      pw.focus();
    }, true);
  }

  function addAdminPortal(){
    if(!isAdmin) return;
    const body = document.getElementById('accountSheetBody');
    if(!body || body.querySelector('#adminPortalBtn')) return;
    const logout = body.querySelector('#logoutBtn2');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'adminPortalBtn';
    btn.className = 'account-row';
    btn.innerHTML = '<div><div class="ar-label">Admin</div><div class="ar-sub">Manage reviewer content and tools</div></div><span>→</span>';
    btn.addEventListener('click', async function(){
      try{
        const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
        if(error) throw error;
        location.href = data && data.currentLevel === 'aal2' ? 'admin.html' : 'admin-mfa.html';
      }catch(e){ location.href = 'admin-mfa.html'; }
    });
    if(logout) body.insertBefore(btn, logout); else body.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', function(){
    hardenSignupForm();
    if(typeof sb === 'undefined') return;
    sb.auth.getSession().then(async function(res){
      const session = res && res.data && res.data.session;
      isAdmin = await resolveAdmin(session);
    });
    sb.auth.onAuthStateChange(function(event, session){
      if(event === 'SIGNED_OUT'){ isAdmin = false; return; }
      if(session) resolveAdmin(session).then(v => { isAdmin = v; });
    });
    document.addEventListener('click', function(e){
      if(e.target && e.target.closest && e.target.closest('#openAccountBtn')) setTimeout(addAdminPortal, 0);
    });
  });
})();

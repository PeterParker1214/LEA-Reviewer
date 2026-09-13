/*
 * What's New: the version history in data/changelog.json (newest first).
 *   popup()     - on Home, shows versions newer than the last one this device saw
 *   listHtml()  - the full history, for Profile's Versions tab
 * It also feeds the notifications bell (kind 'update').
 *
 * WHEN TO ANNOUNCE
 * Not every push is a version. Small pushes add their lines to the top entry
 * with "draft": true — readers see nothing. When the draft adds up to something
 * worth telling readers about, remove "draft" to publish it:
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
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
      '.wn-version{background:var(--bg-panel);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:13px 16px;margin-bottom:10px;text-align:left;}' +
      '.wn-top{display:flex;gap:8px;align-items:center;font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px;}' +
      '.wn-tag{color:var(--gold-bright);font-weight:600;}' +
      '.wn-title{font-weight:600;font-size:15px;color:var(--ink);margin-bottom:6px;}' +
      '.wn-items{margin:0;padding-left:18px;color:var(--ink);font-size:13.5px;line-height:1.55;}' +
      '.wn-items li{margin-bottom:3px;}' +
      '.wn-overlay{position:fixed;inset:0;z-index:5000;background:rgba(4,8,12,.62);display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '.wn-sheet{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--bg-deep);border:1px solid var(--line);border-radius:14px;padding:20px 18px 16px;box-shadow:0 18px 50px rgba(0,0,0,.5);}' +
      '.wn-head{font-family:var(--font-display);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--ink);margin:0 0 14px;}' +
      '.wn-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:6px;}' +
      '.wn-actions a{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--gold-bright);text-decoration:none;}' +
      '.wn-ok{background:var(--gold);color:#1a1206;border:none;border-radius:10px;padding:11px 22px;font-family:var(--font-display);font-weight:700;font-size:15px;text-transform:uppercase;cursor:pointer;}';
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
        '<h2 class="wn-head" id="wnHead">What’s new</h2>' +
        versions.filter(v => v.build > seen).slice(0, 3).map(versionHtml).join('') +
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

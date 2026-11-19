/*
 * "Buy me a coffee": a small cup that peeks from the right edge of the
 * screen and opens a drawer with the support message from the About page.
 *
 * Content comes from data/contact.json (support_label, support_note,
 * support_url, gcash_qr), the same file about.html reads, so the message
 * is edited in one place. With none of those filled in, nothing shows.
 *
 * Loaded by nav.js, which leaves it off the pages where a reader is busy
 * (quiz runner, duels) and the pages it does not belong on.
 * "Hide this tab" keeps it away for 30 days on that device.
 */
(function () {
  'use strict';
  var HIDE_KEY = 'lea_coffee_hidden_until', SEEN_KEY = 'lea_coffee_seen';
  var HIDE_DAYS = 30;

  try {
    if (Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now()) return;
  } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Only http(s) becomes a link or an image, as on the About page.
  function safeUrl(u) {
    var s = String(u || '').trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A paper cup with a sleepy, happy face. `big` adds the cup's own shadow.
  function cup(big) {
    return '<svg class="qc-cup" viewBox="0 0 64 76" aria-hidden="true" focusable="false">' +
      '<g class="qc-steam" fill="none" stroke-linecap="round" stroke-width="2.6">' +
        '<path d="M24 16c-4-4 4-6 0-11"/><path d="M33 14c-4-4 4-6 0-11"/><path d="M42 16c-4-4 4-6 0-11"/>' +
      '</g>' +
      (big ? '<ellipse cx="32" cy="73" rx="17" ry="2.6" class="qc-shadow"/>' : '') +
      '<path class="qc-body" d="M14 27h36l-4.2 41.5a4 4 0 0 1-4 3.5H22.2a4 4 0 0 1-4-3.5z"/>' +
      '<rect class="qc-lid" x="10.5" y="20" width="43" height="8" rx="3.5"/>' +
      '<path class="qc-lid" d="M17 20l2.4-4.5h25.2L47 20z"/>' +
      '<path class="qc-sleeve" d="M16.1 47h31.8l-1.5 14.6H17.6z"/>' +
      '<path class="qc-stitch" d="M18.2 50.2h27.6M19 58.4h26"/>' +
      '<path class="qc-eye" d="M24.2 37.2q2.3-2.6 4.6 0M35.2 37.2q2.3-2.6 4.6 0"/>' +
      '<ellipse class="qc-blush" cx="23.2" cy="41.6" rx="2.7" ry="1.7"/><ellipse class="qc-blush" cx="40.8" cy="41.6" rx="2.7" ry="1.7"/>' +
      '<path class="qc-mouth" d="M29.6 41.4q2.4 2.6 4.8 0"/>' +
    '</svg>';
  }

  function css() {
    var st = document.createElement('style');
    st.id = 'qc-css';
    st.textContent = [
      '.qc-tab{position:fixed;right:0;top:62%;z-index:3000;display:flex;align-items:center;gap:0;height:62px;padding:0 8px 0 10px;',
      'border:1px solid var(--line,rgba(111,168,207,.25));border-right:0;border-radius:16px 0 0 16px;',
      'background:var(--bg-panel,#0e1c28);color:var(--ink,#eef1e9);cursor:pointer;box-shadow:-6px 8px 22px rgba(0,0,0,.28);',
      '--peek:12px;transform:translateX(var(--peek));transition:transform .45s cubic-bezier(.34,1.56,.64,1),box-shadow .3s;-webkit-tap-highlight-color:transparent;}',
      '.qc-tab.enter{animation:qc-in .9s cubic-bezier(.34,1.56,.64,1) both;}',
      '.qc-tab.leave{transform:translateX(110%);transition:transform .35s ease-in;}',
      '.qc-tab:hover,.qc-tab:focus-visible{transform:translateX(0);box-shadow:-8px 10px 26px rgba(0,0,0,.34);}',
      '.qc-tab:focus-visible{outline:2px solid var(--gold,#e0a83f);outline-offset:3px;}',
      '.qc-tab .qc-cup{width:40px;height:48px;transition:transform .45s cubic-bezier(.34,1.56,.64,1);transform-origin:50% 90%;}',
      '.qc-tab:hover .qc-cup,.qc-tab:focus-visible .qc-cup{transform:rotate(-8deg) translateY(-1px);}',
      '.qc-tab.enter .qc-cup{animation:qc-wiggle .9s ease-in-out .7s;}',
      '.qc-label{max-width:0;overflow:hidden;white-space:nowrap;font-family:var(--font-body,system-ui,sans-serif);font-size:13.5px;font-weight:600;',
      'opacity:0;transition:max-width .45s cubic-bezier(.34,1.56,.64,1),opacity .25s,margin .45s;}',
      '.qc-tab:hover .qc-label,.qc-tab:focus-visible .qc-label{max-width:150px;opacity:1;margin-right:8px;}',
      '@media (hover:none){.qc-label{display:none;}}',
      '@media (max-width:520px){.qc-tab{height:54px;padding:0 6px 0 8px;--peek:10px;top:66%;}.qc-tab .qc-cup{width:34px;height:41px;}}',
      // the cup
      '.qc-body{fill:#fbf3e4;stroke:#3b2a1e;stroke-width:2.4;stroke-linejoin:round;}',
      '.qc-lid{fill:#f1e2c6;stroke:#3b2a1e;stroke-width:2.4;stroke-linejoin:round;}',
      '.qc-sleeve{fill:var(--gold,#e0a83f);stroke:#3b2a1e;stroke-width:2.2;stroke-linejoin:round;}',
      '.qc-stitch{stroke:#3b2a1e;stroke-width:1.2;stroke-dasharray:2.4 2.4;opacity:.55;fill:none;}',
      '.qc-eye,.qc-mouth{fill:none;stroke:#3b2a1e;stroke-width:2.2;stroke-linecap:round;}',
      '.qc-blush{fill:#f2a7a0;opacity:.85;}',
      '.qc-shadow{fill:#000;opacity:.18;}',
      '.qc-steam{stroke:var(--muted,#8b98a5);opacity:0;}',
      '.qc-steam path{stroke-dasharray:14;stroke-dashoffset:14;}',
      '.qc-tab:hover .qc-steam,.qc-tab:focus-visible .qc-steam{opacity:.9;}',
      '.qc-tab:hover .qc-steam path,.qc-tab:focus-visible .qc-steam path{animation:qc-steam 1.6s ease-in-out infinite;}',
      '.qc-tab .qc-steam path:nth-child(2){animation-delay:.25s;}.qc-tab .qc-steam path:nth-child(3){animation-delay:.5s;}',
      // the drawer
      '.qc-overlay{position:fixed;inset:0;z-index:5100;background:rgba(4,8,12,0);transition:background .35s;}',
      '.qc-overlay.in{background:rgba(4,8,12,.55);}',
      '.qc-drawer{position:fixed;top:0;right:0;bottom:0;z-index:5101;width:min(380px,92vw);display:flex;flex-direction:column;',
      'background:var(--bg-panel,#0e1c28);color:var(--ink,#eef1e9);border-left:1px solid var(--line,rgba(111,168,207,.25));',
      'box-shadow:-20px 0 50px rgba(0,0,0,.4);transform:translateX(104%);transition:transform .55s cubic-bezier(.22,1.15,.36,1);outline:none;}',
      '.qc-drawer.in{transform:none;}',
      '.qc-drawer.out{transform:translateX(104%);transition:transform .3s ease-in;}',
      '.qc-scroll{flex:1;overflow:auto;padding:22px 22px 26px;overscroll-behavior:contain;}',
      '.qc-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:var(--muted,#8b98a5);',
      'font-size:24px;line-height:1;cursor:pointer;transition:transform .3s,color .2s,background .2s;}',
      '.qc-x:hover{transform:rotate(90deg);color:var(--ink,#eef1e9);background:color-mix(in srgb,var(--ink,#fff) 8%,transparent);}',
      '.qc-x:focus-visible,.qc-drawer a:focus-visible,.qc-hide:focus-visible{outline:2px solid var(--gold,#e0a83f);outline-offset:2px;}',
      '.qc-hero{display:flex;justify-content:center;margin:6px 0 4px;}',
      '.qc-hero .qc-cup{width:118px;height:140px;}',
      '.qc-hero .qc-steam{opacity:.9;}',
      '.qc-drawer.in .qc-hero .qc-steam path{animation:qc-steam 2.2s ease-in-out infinite;}',
      '.qc-drawer.in .qc-hero .qc-steam path:nth-child(2){animation-delay:.35s;}.qc-drawer.in .qc-hero .qc-steam path:nth-child(3){animation-delay:.7s;}',
      '.qc-drawer.in .qc-hero .qc-cup{animation:qc-hop .8s cubic-bezier(.34,1.56,.64,1) .25s both;}',
      '.qc-h{font-family:var(--font-display,system-ui,sans-serif);font-size:27px;font-weight:800;line-height:1.1;text-align:center;margin:8px 0 12px;}',
      '.qc-note{font-size:14px;line-height:1.65;white-space:pre-line;margin:0 0 18px;color:color-mix(in srgb,var(--ink,#eef1e9) 90%,transparent);}',
      '.qc-qr{display:block;width:fit-content;margin:0 auto;padding:12px 12px 8px;background:#fff;border-radius:14px;text-align:center;text-decoration:none;',
      'box-shadow:0 10px 26px rgba(0,0,0,.25);transform:rotate(-1.5deg);transition:transform .35s cubic-bezier(.34,1.56,.64,1);}',
      '.qc-qr:hover{transform:rotate(0) scale(1.02);}',
      '.qc-qr img{display:block;width:200px;max-width:62vw;height:auto;margin:0 auto;border-radius:6px;}',
      '.qc-qr span{display:block;margin-top:7px;font-family:var(--font-mono,monospace);font-size:11.5px;color:#3b2a1e;}',
      '.qc-go{display:flex;justify-content:center;align-items:center;margin:18px 0 0;padding:13px 16px;border-radius:12px;background:var(--gold,#e0a83f);',
      'color:#1a1206;font-weight:700;font-size:14px;text-decoration:none;transition:transform .2s,filter .2s;}',
      '.qc-go:hover{transform:translateY(-2px);filter:brightness(1.07);}',
      '.qc-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:22px;padding-top:14px;',
      'border-top:1px solid var(--line,rgba(111,168,207,.25));font-size:12.5px;}',
      '.qc-foot a{color:var(--gold-bright,#f0c268);}',
      '.qc-hide{border:0;background:none;padding:0;color:var(--muted,#8b98a5);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;}',
      '.qc-drawer.in .qc-rise{animation:qc-rise .5s cubic-bezier(.34,1.56,.64,1) both;}',
      '@keyframes qc-in{from{transform:translateX(110%);}to{transform:translateX(var(--peek));}}',
      '@keyframes qc-wiggle{0%,100%{transform:rotate(0);}25%{transform:rotate(-12deg);}50%{transform:rotate(9deg);}75%{transform:rotate(-4deg);}}',
      '@keyframes qc-hop{0%{transform:translateY(18px) scale(.8);opacity:0;}60%{transform:translateY(-8px) scale(1.04);opacity:1;}100%{transform:none;}}',
      '@keyframes qc-steam{0%{stroke-dashoffset:14;opacity:0;transform:translateY(4px);}40%{opacity:1;}100%{stroke-dashoffset:-14;opacity:0;transform:translateY(-6px);}}',
      '@keyframes qc-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}',
      '@media (prefers-reduced-motion:reduce){.qc-tab,.qc-tab *,.qc-overlay,.qc-drawer,.qc-drawer *{animation:none !important;transition:none !important;}',
      '.qc-steam path{stroke-dashoffset:0;}}'
    ].join('');
    document.head.appendChild(st);
  }

  function build(c) {
    var label = c.support_label || 'Buy me a coffee';
    var qr = safeUrl(c.gcash_qr), go = safeUrl(c.support_url);
    css();

    var tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'qc-tab';
    tab.setAttribute('aria-haspopup', 'dialog');
    tab.setAttribute('aria-label', label + ': support LEA Reviewer');
    tab.innerHTML = '<span class="qc-label">' + esc(label) + '</span>' + cup(false);
    // Slide in once per visit; after that it is simply there.
    var first = true;
    try { first = !sessionStorage.getItem(SEEN_KEY); sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    if (first && !reduced) {
      tab.style.visibility = 'hidden';
      setTimeout(function () { tab.style.visibility = ''; tab.classList.add('enter'); }, 1400);
      tab.addEventListener('animationend', function (e) { if (e.target === tab) tab.classList.remove('enter'); });
    }
    document.body.appendChild(tab);

    var overlay, drawer;
    function open() {
      if (drawer) return;
      overlay = document.createElement('div');
      overlay.className = 'qc-overlay';
      drawer = document.createElement('div');
      drawer.className = 'qc-drawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-labelledby', 'qcTitle');
      drawer.tabIndex = -1;
      var d = 0, rise = function (cls) { d += 70; return ' class="qc-rise' + (cls ? ' ' + cls : '') + '" style="animation-delay:' + (180 + d) + 'ms"'; };
      drawer.innerHTML =
        '<button type="button" class="qc-x" aria-label="Close">×</button>' +
        '<div class="qc-scroll">' +
          '<div class="qc-hero">' + cup(true) + '</div>' +
          '<h2 id="qcTitle" class="qc-h"><span' + rise() + '>' + esc(label) + '</span></h2>' +
          (c.support_note ? '<p class="qc-note"><span' + rise() + '>' + esc(c.support_note) + '</span></p>' : '') +
          (qr ? '<div' + rise() + '><a class="qc-qr" href="' + esc(qr) + '" target="_blank" rel="noopener noreferrer" title="Open the full-size QR" aria-label="GCash QR code. Opens the full-size image.">' +
                  '<img src="' + esc(qr) + '" alt="">' +
                  '<span>Scan with GCash</span></a></div>' : '') +
          (go ? '<div' + rise() + '><a class="qc-go" href="' + esc(go) + '" target="_blank" rel="noopener noreferrer">Support LEA Reviewer</a></div>' : '') +
          '<div' + rise('qc-foot') + '><a href="about.html">About LEA Reviewer</a>' +
            '<button type="button" class="qc-hide">Hide this tab for ' + HIDE_DAYS + ' days</button></div>' +
        '</div>';
      document.body.appendChild(overlay);
      document.body.appendChild(drawer);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        overlay.classList.add('in'); drawer.classList.add('in');
      }); });
      drawer.querySelector('.qc-x').focus({ preventScroll: true });
      overlay.addEventListener('click', close);
      drawer.querySelector('.qc-x').addEventListener('click', close);
      drawer.querySelector('.qc-hide').addEventListener('click', hide);
      document.addEventListener('keydown', onKey);
    }
    function close(after) {
      if (!drawer) return;
      var o = overlay, dr = drawer;
      overlay = drawer = null;
      document.removeEventListener('keydown', onKey);
      o.classList.remove('in'); dr.classList.remove('in'); dr.classList.add('out');
      setTimeout(function () { o.remove(); dr.remove(); if (typeof after === 'function') after(); }, reduced ? 0 : 320);
      if (typeof after !== 'function') tab.focus({ preventScroll: true });
    }
    function hide() {
      try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 864e5)); } catch (e) {}
      close(function () {
        tab.classList.add('leave');
        setTimeout(function () { tab.remove(); }, reduced ? 0 : 380);
      });
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab' || !drawer) return;
      // Keep Tab inside the drawer while it is open.
      var f = drawer.querySelectorAll('button, a[href]');
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    tab.addEventListener('click', open);
    window.LEACoffee = { open: open, close: close };
  }

  function start() {
    fetch('data/contact.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (c) {
        c = c || {};
        if (c.support_note || safeUrl(c.gcash_qr) || safeUrl(c.support_url)) build(c);
      })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

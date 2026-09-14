/* LEA Reviewer — navigation flow.
 *
 * WHY
 * Leaving a page used to be a jump to a fixed place: finishing or exiting a
 * question opened by Search dropped you on the subject page, and every back
 * arrow went straight to Home, wherever you had come from. This makes "back"
 * mean back: to the page you were on, scrolled to where you were.
 *
 * WHAT IT DOES
 *   - Remembers each page's scroll position (per URL, this tab only) and puts
 *     it back when you return, waiting for pages that draw their list late.
 *   - LEANav.back(fallback) returns to the previous page on this site when
 *     there is one, and opens `fallback` when there is not (a fresh tab, a
 *     link from outside).
 *   - Any link or button with data-back does the same on click, using its
 *     own href as the fallback.
 *   - Tells the page transition which way you are going, so going back plays
 *     the animation in reverse (see "PAGE TRANSITIONS" in blueprint.css).
 */
(function () {
  'use strict';
  var SCROLL_PREFIX = 'lea_scroll:';
  var DIR_KEY = 'lea_nav_dir';

  function key() { return SCROLL_PREFIX + location.pathname + location.search; }
  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function drop(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  // Browsers that can't animate between pages (iPhones before iOS 18.2):
  // the arriving page at least slides in from the side you're heading
  // (html.lea-enter in blueprint.css).
  if (!window.CSSViewTransitionRule && read(DIR_KEY)) {
    document.documentElement.classList.add(read(DIR_KEY) === 'back' ? 'lea-enter-back' : 'lea-enter');
    document.addEventListener('DOMContentLoaded', function () { drop(DIR_KEY); });
  }

  function saveScroll() { store(key(), String(Math.round(window.scrollY))); }
  window.addEventListener('pagehide', saveScroll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveScroll(); });

  // Lists on most pages are drawn after data arrives, so the page may still be
  // too short to scroll to the saved spot. Keep trying for a moment, and stop
  // the instant the reader scrolls on their own.
  function restoreScroll() {
    var saved = Number(read(key()));
    if (!saved) return;
    var tries = 0, gaveUp = false;
    function stop() { gaveUp = true; }
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    (function attempt() {
      if (gaveUp) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= saved - 4) { window.scrollTo(0, saved); return; }
      // Up to ~6s: Search rebuilds its whole question index before it can
      // draw the results you were scrolled into.
      if (++tries < 100) setTimeout(attempt, 60);
    })();
  }

  function cameFromThisSite() {
    try {
      return !!document.referrer && new URL(document.referrer).origin === location.origin &&
        document.referrer !== location.href && history.length > 1;
    } catch (e) { return false; }
  }

  // How deep a page sits: Home, then the pages it opens, then the quiz.
  // "Back" may step up or across, but never back down into a page you
  // already left from below — that was the loop where a subject's Back
  // reopened the quiz you had just finished.
  var DEPTH = { home: 0, run: 2, reminders: 2 };
  function depthOf(u) { var n = pageName(u); return DEPTH.hasOwnProperty(n) ? DEPTH[n] : 1; }
  function okToStepBack(url) {
    try { if (!url || new URL(url).origin !== location.origin) return false; } catch (e) { return false; }
    var here = depthOf(location.href), there = depthOf(url);
    return there < here || (there === here && here < 2);
  }

  // Returns to `target` if it is further back in this tab's history (so no
  // duplicate copy piles up), otherwise opens it.
  function goTo(target) {
    store(DIR_KEY, 'back');
    store(TO_KEY, new URL(target, location.href).href);
    var nav = window.navigation;
    if (nav && nav.entries && nav.currentEntry) {
      var entries = nav.entries();
      for (var j = nav.currentEntry.index - 1; j >= 0; j--) {
        if (entries[j].url && pairs(target, entries[j].url)) { nav.traverseTo(entries[j].key); return; }
      }
    }
    location.href = target;
  }

  function back(fallback) {
    store(DIR_KEY, 'back');
    fallback = fallback || 'index.html';
    var nav = window.navigation;
    if (nav && nav.entries && nav.currentEntry) {
      var prev = nav.entries()[nav.currentEntry.index - 1];
      if (prev && okToStepBack(prev.url)) { store(TO_KEY, prev.url); history.back(); return; }
      goTo(fallback); return;
    }
    // Browsers without the Navigation API: the referrer is the best guess.
    if (cameFromThisSite() && okToStepBack(document.referrer)) { store(TO_KEY, document.referrer); history.back(); return; }
    location.href = fallback;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-back]');
    if (!el || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    var href = el.getAttribute('href') || 'index.html';
    // data-back="to": a link that names its destination ("← History of
    // Architecture") goes exactly there, not merely one step back.
    if (el.getAttribute('data-back') === 'to') goTo(href); else back(href);
  });

  // Any other same-site navigation is "forward".
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && !a.hasAttribute('data-back') && a.origin === location.origin) { store(DIR_KEY, 'forward'); store(TO_KEY, a.href); }
  }, true);

  // Which two pages a transition runs between. Chrome says so itself
  // (navigation.activation); Safari has no Navigation API, so the trip is
  // written down here as it starts — without it Safari got no flying
  // pieces and no subject/quiz motion, only the plain slide.
  var TO_KEY = 'lea_nav_to', FROM_KEY = 'lea_nav_from';

  // Browser back/forward buttons and swipe-back count as "back".
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) restoreScroll();
  });
  window.addEventListener('popstate', function () { store(DIR_KEY, 'back'); });

  // Cross-document view transitions: label this one with its direction.
  window.addEventListener('pagereveal', function (e) {
    var navType = (performance.getEntriesByType('navigation')[0] || {}).type;
    var dir = read(DIR_KEY) || (navType === 'back_forward' ? 'back' : 'forward');
    drop(DIR_KEY);
    if (e.viewTransition && e.viewTransition.types) e.viewTransition.types.add(dir);
    var act = window.navigation && navigation.activation;
    var fromUrl = (act && act.from && act.from.url) || read(FROM_KEY);
    drop(FROM_KEY); drop(TO_KEY);
    if (e.viewTransition && e.viewTransition.types && fromUrl) {
      var types = e.viewTransition.types;
      var here = pageName(location.href), there = pageName(fromUrl);
      // A quiz is a task laid over where you were, so it rises and falls
      // instead of sliding sideways.
      if (here === 'run' && there !== 'run') types.add('run-open');
      else if (there === 'run' && here !== 'run') types.add('run-close');
      // A subject card opens up into its page, and folds back into its card.
      else if (there === 'home' && here === 'subject') types.add('drill-open');
      else if (there === 'subject' && here === 'home') types.add('drill-close');
    }
    if (e.viewTransition && fromUrl) nameFor(fromUrl, e.viewTransition);
    if (e.viewTransition) {
      activeTransition = e.viewTransition;
      e.viewTransition.finished.then(endTransition, endTransition);
    }
  });

  // Chrome abandons a page transition the moment a flying piece (a subject's
  // name, its card) is removed from the page, and Home and Subject redraw
  // their whole body when their data arrives, usually mid-flight. That is
  // what made the trip back to Home a cut. Pages hand those redraws to
  // LEANav.afterTransition, which runs them once the animation has finished
  // (or straight away when nothing is animating).
  var activeTransition = null, waiting = [];
  function endTransition() {
    activeTransition = null;
    var run = waiting; waiting = [];
    run.forEach(function (fn) { try { fn(); } catch (err) { setTimeout(function () { throw err; }); } });
  }
  function afterTransition(fn) {
    if (!activeTransition) { fn(); return; }
    if (waiting.indexOf(fn) === -1) waiting.push(fn);   // three redraws queued = one redraw
  }

  function pageName(u) {
    var p = new URL(u, location.href).pathname;
    if (/\/(index\.html)?$/.test(p)) return 'home';
    var m = p.match(/\/([\w-]+)\.html$/);
    return m ? m[1] : '';
  }

  // Shared pieces (the search button and field, a subject's name and its
  // heading…) are named only when you travel between their two pages. A
  // permanent name would lift them out of every other transition, and they
  // would hang still while the page slid around them.
  function pageOf(u) {
    var x = new URL(u, location.href);
    return { path: x.pathname.replace(/index\.html$/, ''), search: x.search };
  }
  function pairs(peer, other) {
    var p = pageOf(peer), o = pageOf(other);
    return p.path === o.path && (!p.search || p.search === o.search);
  }
  function clearNames() {
    document.querySelectorAll('[data-vt]').forEach(function (el) { el.style.viewTransitionName = ''; });
  }
  function nameFor(otherUrl, vt) {
    if (!otherUrl || !vt) return;
    function apply() {
      document.querySelectorAll('[data-vt]').forEach(function (el) {
        var peer = el.getAttribute('data-vt-peer') || el.getAttribute('href');
        var name = (peer && pairs(peer, otherUrl)) ? el.getAttribute('data-vt') : '';
        if (el.style.viewTransitionName !== name) el.style.viewTransitionName = name;
      });
    }
    apply();
    // Home and Subject redraw themselves as their data arrives, often in the
    // middle of the animation. A redrawn heading is a brand-new element, so
    // name it too, or the flying piece loses the place it was flying to.
    var watch = new MutationObserver(apply);
    watch.observe(document.documentElement, { childList: true, subtree: true });
    function done() { watch.disconnect(); clearNames(); }
    vt.finished.then(done, done);
  }
  window.addEventListener('pageswap', function (e) {
    store(FROM_KEY, location.href);
    var toUrl = (e.activation && e.activation.entry && e.activation.entry.url) || read(TO_KEY);
    if (e.viewTransition && toUrl) nameFor(toUrl, e.viewTransition);
  });
  // A page brought back from the back/forward cache may still carry names.
  window.addEventListener('pageshow', function (e) { if (e.persisted) clearNames(); });

  // Pages that draw themselves after data arrives look empty at the moment a
  // page transition takes its picture. Keep what a [data-snap] container
  // showed when you left, and put it back the instant the page loads again;
  // the page's real render replaces it a moment later.
  var SNAP_PREFIX = 'lea_snap:';
  function snapKey(el) { return SNAP_PREFIX + location.pathname + location.search + '#' + el.id; }
  window.addEventListener('pagehide', function () {
    clearNames();   // a name kept in the snapshot would fly on every later trip
    document.querySelectorAll('[data-snap]').forEach(function (el) {
      if (!el.id || !el.getClientRects().length) return;   // hidden (e.g. signed out): keep nothing
      var html = el.innerHTML;
      if (html.length < 300000) store(snapKey(el), html);
    });
  });
  // Return trips only. Opening a page fresh shows its skeleton and lets the
  // lists rise in; coming back shows it as you left it, scrolled where you were.
  function restoreSnap(el) {
    var nt = (performance.getEntriesByType('navigation')[0] || {}).type;
    if (nt !== 'back_forward' && read(DIR_KEY) !== 'back') return false;
    var html = el && read(snapKey(el));
    if (!html) return false;
    el.innerHTML = html;
    document.documentElement.classList.add('lea-snap');
    var saved = Number(read(key()));
    if (saved) window.scrollTo(0, saved);
    return true;
  }
  function clearSnaps() {
    try {
      Object.keys(sessionStorage).forEach(function (k) {
        if (k.indexOf(SNAP_PREFIX) === 0) sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }

  var navType = (performance.getEntriesByType('navigation')[0] || {}).type;
  if (navType === 'back_forward' || read(DIR_KEY) === 'back') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreScroll);
    else restoreScroll();
  }

  // Lists rise in one after another when a page first draws them
  // (.lea-stagger in blueprint.css). Once that first entrance has played,
  // later redraws — a filter tap, a tab switch — just appear.
  // Settles once the whole first list has had time to rise (last item starts
  // at 540ms and runs 560ms), or after 8s if nothing ever arrives.
  var settleTimer = setTimeout(settle, 8000);
  function settle() { document.documentElement.classList.add('lea-settled'); }
  document.addEventListener('animationstart', function (e) {
    if (e.animationName !== 'lea-rise-in' || settleTimer === 'started') return;
    clearTimeout(settleTimer); settleTimer = 'started';
    setTimeout(settle, 1800);   // long enough for Standings' bars to finish filling
  });

  // Skeletons: the shape of what is coming, drawn while it loads, instead of
  // the word "Loading". A drafting rule sweeps down over them (blueprint.css).
  function skel(kind, n, id) {
    var b = function (c) { return '<i class="skel' + (c ? ' ' + c : '') + '"></i>'; };
    var rep = function (s, k) { var o = ''; for (var i = 0; i < k; i++) o += s; return o; };
    var card = '<div class="skel-card">' + b('s-kicker') + b('s-title') + b() + b('s-mid') + '</div>';
    var row = '<div class="skel-row">' + b('s-face') + '<span class="skel-grow">' + b('s-mid') + b('s-kicker') + '</span>' + b('s-num') + '</div>';
    var subjectRest =
      '<div class="skel-card s-tall"' + (id ? ' data-vt="card-' + id + '" data-vt-peer="index.html"' : '') + '>' +
        b('s-kicker') + '<div class="skel-cells">' + b('s-cell') + b('s-cell') + b('s-cell') + '</div>' + b('s-bar') +
      '</div>' +
      rep('<div class="skel-card s-row">' + b('s-mid') + b('s-kicker') + '</div>', 3) +
      rep('<div class="skel-card s-module">' + b('s-kicker') + b('s-title') + b('s-bar') + '</div>', 4);
    var html;
    if (kind === 'rows') html = rep(row, n || 5);
    else if (kind === 'home') html =
      '<div class="skel-top">' + b('s-face') + '<span class="skel-grow">' + b('s-kicker') + b('s-title') + '</span>' + b('s-icon') + b('s-icon') + b('s-icon') + '</div>' +
      '<div class="skel-card s-clock">' + b('s-kicker') + '<div class="skel-cells">' + b('s-flap') + b('s-flap') + b('s-flap') + b('s-flap') + '</div>' + b('s-bar') + '</div>' +
      '<div class="skel-card s-row">' + b('s-mid') + b('s-kicker') + '</div>' +
      '<div class="skel-grid">' + rep('<div class="skel-card s-subject">' + b('s-title') + b('s-bar') + '</div>', n || 6) + '</div>';
    else if (kind === 'subject') html =
      '<div class="skel-mast">' + b('s-kicker') + b('s-head') + b('s-mid') + '</div>' + subjectRest;
    else if (kind === 'subject-rest') html = subjectRest;
    else if (kind === 'question') html =
      b('s-kicker') + '<div class="skel-card">' + b() + b() + b('s-mid') + '</div>' + rep('<div class="skel-card s-option">' + b('s-mid') + '</div>', 4);
    else if (kind === 'profile') html =
      '<div class="skel-top">' + b('s-icon') + b('s-title') + '</div>' +
      '<div class="skel-card skel-id">' + b('s-avatar') + '<span class="skel-grow">' + b('s-title') + b('s-mid') + b('s-kicker') + '</span></div>' + rep(card, 2);
    else html = rep(card, n || 3);
    return '<div class="skel-wrap" aria-busy="true" aria-label="Loading">' + html + '</div>';
  }

  window.LEANav = { back: back, saveScroll: saveScroll, restoreSnap: restoreSnap, clearSnaps: clearSnaps, skel: skel, goTo: goTo, afterTransition: afterTransition };
})();

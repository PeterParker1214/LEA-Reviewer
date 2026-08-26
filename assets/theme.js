/* LEA Reviewer — shared light/dark theme toggle.
   One localStorage key ('leaTheme') is used across every page, so the
   choice made anywhere on the site carries over everywhere else. */
(function () {
  var KEY = 'leaTheme';

  function currentMode() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved === 'dark' || saved === 'light') return saved;
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function wantsAlt(mode, defaultIs) {
    var isDark = mode === 'dark';
    return (defaultIs === 'light') ? isDark : !isDark;
  }

  function apply(mode, opts) {
    var isDark = mode === 'dark';
    var wantAltClass = wantsAlt(mode, opts.defaultIs);
    // Mirrored onto <html> as well as <body>: the early-apply below can only
    // reach <html> (it runs from <head>, before <body> exists), so the two
    // must stay in step or toggling would leave a stale class behind.
    document.documentElement.classList.toggle(opts.altClass, wantAltClass);
    document.body.classList.toggle(opts.altClass, wantAltClass);
    if (opts.button) {
      opts.button.textContent = isDark ? (opts.darkIcon || '\u2600\uFE0F') : (opts.lightIcon || '\uD83C\uDF19');
      opts.button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  // Held at module scope so toggle() works from anywhere — the control is no
  // longer necessarily a button this module wired up itself (Home drives it
  // from a row inside the account sheet).
  var activeOpts = null;
  var activeMode = null;

  function toggle() {
    if (!activeOpts) return null;
    activeMode = (activeMode === 'dark') ? 'light' : 'dark';
    try { localStorage.setItem(KEY, activeMode); } catch (e) {}
    apply(activeMode, activeOpts);
    return activeMode;
  }

  // opts: { altClass, defaultIs: 'light'|'dark', buttonId, darkIcon, lightIcon }
  function init(opts) {
    opts = opts || {};
    opts.altClass = opts.altClass || 'dark-mode';
    opts.defaultIs = opts.defaultIs || 'light';
    opts.button = opts.buttonId ? document.getElementById(opts.buttonId) : null;

    activeOpts = opts;
    activeMode = currentMode();
    apply(activeMode, opts);

    if (opts.button) opts.button.addEventListener('click', toggle);
    return { get: function () { return activeMode; }, toggle: toggle };
  }

  // ---- Early apply (flash-of-wrong-theme fix) ----
  // init() runs far too late to decide the palette: it's called from the end
  // of the body on most pages, and on welcome.html from inside an async boot
  // that first awaits two network round-trips. Until then the page paints
  // with the default (dark) tokens, so every light-mode reader saw a dark
  // flash on every navigation.
  //
  // This runs the moment the script is parsed in <head>. <body> doesn't exist
  // yet, so the class goes on <html> — which is why each page's palette block
  // is selected as `body.light-mode, :root.light-mode`. Config comes from the
  // script tag's own data attributes, since init()'s options aren't known yet
  // and the two themes disagree about which class is the alternate one.
  var tag = document.currentScript;
  if (tag) {
    var altClass = tag.getAttribute('data-alt-class');
    var defaultIs = tag.getAttribute('data-default-is');
    if (altClass && defaultIs) {
      try {
        document.documentElement.classList.toggle(altClass, wantsAlt(currentMode(), defaultIs));
      } catch (e) {}
    }
  }

  window.LEATheme = { init: init, toggle: toggle };
})();

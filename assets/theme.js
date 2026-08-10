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

  function apply(mode, opts) {
    var isDark = mode === 'dark';
    var wantAltClass = (opts.defaultIs === 'light') ? isDark : !isDark;
    document.body.classList.toggle(opts.altClass, wantAltClass);
    if (opts.button) {
      opts.button.textContent = isDark ? (opts.darkIcon || '\u2600\uFE0F') : (opts.lightIcon || '\uD83C\uDF19');
      opts.button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  // opts: { altClass, defaultIs: 'light'|'dark', buttonId, darkIcon, lightIcon }
  function init(opts) {
    opts = opts || {};
    opts.altClass = opts.altClass || 'dark-mode';
    opts.defaultIs = opts.defaultIs || 'light';
    opts.button = opts.buttonId ? document.getElementById(opts.buttonId) : null;

    var mode = currentMode();
    apply(mode, opts);

    if (opts.button) {
      opts.button.addEventListener('click', function () {
        mode = (mode === 'dark') ? 'light' : 'dark';
        try { localStorage.setItem(KEY, mode); } catch (e) {}
        apply(mode, opts);
      });
    }
    return { get: function () { return mode; } };
  }

  window.LEATheme = { init: init };
})();

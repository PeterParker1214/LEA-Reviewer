/* LEA Reviewer — shared theme picker.
   Four themes instead of dark/light: blueprint (the original dark look),
   vellum (warm paper, which replaces light mode), lightbox and olive.

   One localStorage key ('leaTheme') is used across every page, so the choice
   made anywhere carries over everywhere else. Older saved values still work:
   'dark' reads as blueprint and 'light' as vellum.

   The theme is written to <html data-theme="…">; the token blocks for each
   theme live at the end of assets/blueprint.css. Vellum ALSO sets the old
   `light-mode` class on <html> and <body>, so every page's existing light
   palette and light-only rules keep applying underneath the vellum tokens. */
(function () {
  var KEY = 'leaTheme';
  var THEMES = ['blueprint', 'vellum', 'lightbox', 'olive'];
  var LIGHT = { vellum: true };

  function saved() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    if (v === 'dark') return 'blueprint';
    if (v === 'light') return 'vellum';
    if (THEMES.indexOf(v) !== -1) return v;
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'vellum' : 'blueprint';
  }

  function paint(theme) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('light-mode', !!LIGHT[theme]);
    if (document.body) document.body.classList.toggle('light-mode', !!LIGHT[theme]);
  }

  var current = saved();

  function set(theme) {
    if (THEMES.indexOf(theme) === -1) return current;
    current = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    paint(theme);
    try { document.dispatchEvent(new CustomEvent('lea-theme', { detail: { theme: theme } })); } catch (e) {}
    return current;
  }

  // Pages still call init({ altClass:'light-mode', defaultIs:'dark' }) from
  // the body. The options no longer matter; this just repaints now that
  // <body> exists, so the body class catches up with <html>.
  function init() {
    paint(current);
    return { get: get, set: set };
  }
  function get() { return current; }
  // Kept for anything that still flips "the other theme": steps to the next one.
  function toggle() { return set(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]); }

  // Runs the moment the script is parsed in <head>, before anything paints,
  // so no page flashes the wrong theme on navigation.
  try { paint(current); } catch (e) {}

  window.LEATheme = { init: init, get: get, set: set, toggle: toggle, list: THEMES.slice() };
})();

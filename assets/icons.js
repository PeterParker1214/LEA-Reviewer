/*
 * LEA Reviewer — inline SVG icon set.
 *
 * The handoff is explicit about this: "Icons are inline SVG, drawn on Lucide
 * geometry at stroke-width:1.5, stroke=currentColor, 13–19px … The current app
 * uses emoji (⏻ 🏆 ☀️ 🔖 🔥) — replacing them with these SVGs was an explicit
 * request." Inline means no request and they work offline; currentColor means
 * they follow the surrounding text colour and both themes for free, which the
 * emoji never did (emoji ignore --gold and render differently per platform).
 *
 * Each function returns an SVG string. Size is the box; stroke stays 1.5 so
 * the weight matches the rest of the drawing at any size.
 *
 *   document.getElementById('x').innerHTML = LEAIcons.trophy(18);
 */
window.LEAIcons = (function () {
  function wrap(size, body, extra) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' +
      (extra ? ' ' + extra : '') + '>' + body + '</svg>';
  }

  return {
    sun: function (s) {
      return wrap(s || 18,
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41' +
        'M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>');
    },
    moon: function (s) {
      return wrap(s || 18, '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>');
    },
    trophy: function (s) {
      return wrap(s || 18,
        '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>' +
        '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>' +
        '<path d="M4 22h16"/>' +
        '<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>' +
        '<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>' +
        '<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>');
    },
    flame: function (s) {
      return wrap(s || 18,
        '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 ' +
        '.5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>');
    },
    eye: function (s) {
      return wrap(s || 18,
        '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/>' +
        '<circle cx="12" cy="12" r="3"/>');
    },
    eyeOff: function (s) {
      return wrap(s || 18,
        '<path d="M10.73 5.08a10.74 10.74 0 0 1 11.21 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.45 2.49"/>' +
        '<path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/>' +
        '<path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/>' +
        '<path d="m2 2 20 20"/>');
    },
    power: function (s) {
      return wrap(s || 18, '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>');
    },
    grid: function (s) {
      return wrap(s || 18,
        '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
        '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
        '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
        '<rect x="14" y="14" width="7" height="7" rx="1"/>');
    },
    pencil: function (s) {
      return wrap(s || 18,
        '<path d="M21.17 6.83a2.83 2.83 0 0 0-4-4L3 17v4h4Z"/>' +
        '<path d="m15 5 4 4"/>');
    },
    plus: function (s) {
      return wrap(s || 18, '<path d="M12 5v14"/><path d="M5 12h14"/>');
    },
    undo: function (s) {
      return wrap(s || 18,
        '<path d="M3 7v6h6"/>' +
        '<path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7"/>');
    },
    flag: function (s) {
      return wrap(s || 18,
        '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z"/>' +
        '<path d="M4 22v-7"/>');
    }
  };
})();

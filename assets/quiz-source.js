/* LEAQuizSource — one way to read a module's questions, whatever it is stored as.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every cross-subject feature (Daily Drill, Mock Exam, Weak Spots, Search, the
 * flagged drill) builds a question index, and each copy of that builder began
 * with `if (mod.format !== 'json') continue;`. That single line made 61% of the
 * bank invisible: of 4,132 questions in ready subjects, only History's 1,552
 * and four Building Laws modules' 70 were ever reachable. Five of seven ready
 * subjects contributed nothing, so "Daily Drill" was in practice a History
 * drill, and every topic row on those subjects led to "nothing left to drill"
 * on a subject at 0%.
 *
 * The questions were always there — they just live inside the legacy quiz
 * pages as a JS array literal rather than in a .json file.
 *
 * THE ORDERING INVARIANT
 * ----------------------
 * `mastered[]`, `flagged[]` and `notes{}` are keyed by a question's POSITION in
 * its module's array. The legacy quiz pages shuffle presentation order but
 * store the original index (`markMastered(..., order[pos])`), so the authored
 * array order is canonical. This module therefore never sorts, filters or
 * de-duplicates: it returns questions in source order, always. A question that
 * should disappear is hidden in place (`q.hidden`), never spliced out.
 *
 * CANONICAL SHAPE
 * ---------------
 *   { s, q, o[], c, ref?, n?, img?, nimg?, hidden? }
 * `img` is the figure shown with the question; `nimg` the one shown with the
 * explanation, after it has been answered.
 * `QUESTIONS`-format quiz pages already use exactly this shape, so they need no
 * conversion. `QUIZ_DATA`-format pages use an older shape and are mapped.
 */
(function () {
  'use strict';

  var CACHE_PREFIX = 'lea_qsrc_v1_';

  // Balanced-bracket scan so quiz text containing brackets or quotes can't
  // break extraction. Lifted from subject.html, which has used it against
  // these same files since the topics card shipped.
  function extractBalanced(text, startIdx) {
    var openCh = text[startIdx];
    var pairs = { '[': ']', '{': '}', '(': ')' };
    var closeCh = pairs[openCh];
    var depth = 0, inString = null;
    for (var i = startIdx; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (ch === '\\') { i++; continue; }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
      if (ch === '/' && text[i + 1] === '/') { var nl = text.indexOf('\n', i); i = (nl === -1 ? text.length : nl); continue; }
      if (ch === '/' && text[i + 1] === '*') { var end = text.indexOf('*/', i + 2); i = (end === -1 ? text.length : end + 1); continue; }
      if (ch === openCh) depth++;
      else if (ch === closeCh) { depth--; if (depth === 0) return i + 1; }
    }
    return -1;
  }

  function extractLiteral(html, varName, openCh) {
    var marker = 'const ' + varName + ' = ';
    var idx = html.indexOf(marker);
    if (idx === -1) return null;
    var start = idx + marker.length;
    if (html[start] !== openCh) return null;
    var end = extractBalanced(html, start);
    if (end === -1) return null;
    try { return new Function('return ' + html.slice(start, end))(); } catch (e) { return null; }
  }

  function extractArrayLiteral(html, varName) { return extractLiteral(html, varName, '['); }

  // Some quiz pages keep one lookup table of pictures and have each question
  // name a key into it, rather than repeating a path on every question. That
  // is how a single figure sheet ("A B C D E") is shared by the five questions
  // that ask about it:
  //
  //   const FIGURES = { "pump": "img/q0001.jpg", ... };
  //   { q: "Identify a Centrifugal Pump", fig: "pump", ... }
  //
  // The table is not always called the same thing — FIGURES in Building
  // Utilities, IMAGES in the Structural exam — so every known name is tried.
  // Getting this wrong is expensive twice over: the questions render with no
  // figure, AND anything scanning for unused images calls the files orphans
  // and offers to delete them. Both have happened. Add a name here rather
  // than teaching any one page a special case.
  var FIGURE_TABLES = ['FIGURES', 'IMAGES'];
  function extractFigures(html) {
    for (var i = 0; i < FIGURE_TABLES.length; i++) {
      var t = extractLiteral(html, FIGURE_TABLES[i], '{');
      if (t) return t;
    }
    return null;
  }

  // Images are written relative to the quiz page that declares them
  // ("img/q0001.jpg"), but the engine renders from the site root, where that
  // path resolves somewhere else entirely. Rebase against the module's own
  // directory. Absolute and data URLs are left alone.
  function rebaseImg(src, modFile) {
    if (!src) return src;
    if (/^([a-z]+:)?\/\//i.test(src) || src.charAt(0) === '/' || src.indexOf('data:') === 0) return src;
    var slash = modFile.lastIndexOf('/');
    return slash === -1 ? src : modFile.slice(0, slash + 1) + src;
  }

  // The older QUIZ_DATA shape: options carry their own letter, and the answer
  // is that letter rather than an index.
  //
  // It carries no per-question topic, and this function does not invent one.
  // Subject's topics block treats "no topic field" as untagged and excludes the
  // module by design — filling `s` with the module title here would smuggle the
  // pseudo-topic back in and let it win "weakest" on size. The cross-subject
  // index applies its own `q.s || mod.title` fallback where a label is needed
  // for grouping; that is the index's business, not the source's.
  // Where a question's picture comes from, whichever way this file stores it:
  // directly on the question, or via a key into the page's FIGURES table.
  function imgFor(row, modFile, figures) {
    var src = row.img;
    if (!src && row.fig && figures) src = figures[row.fig];
    return src ? rebaseImg(src, modFile) : undefined;
  }

  function fromQuizData(arr, modFile, figures) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i] || {};
      var opts = row.options || [];
      var texts = [], correctIdx = -1;
      for (var j = 0; j < opts.length; j++) {
        var o = opts[j];
        if (o && typeof o === 'object') {
          texts.push(o.text);
          if (o.letter != null && String(o.letter) === String(row.correct)) correctIdx = j;
        } else {
          texts.push(o);
        }
      }
      // Fall back to matching the answer text if letters are absent.
      if (correctIdx === -1) correctIdx = texts.indexOf(row.correct);
      out.push({
        s: row.s,
        q: row.question != null ? row.question : row.q,
        o: texts,
        c: correctIdx,
        n: row.explanation || row.n || undefined,
        ref: row.ref || undefined,
        img: imgFor(row, modFile, figures),
        hidden: !!row.hidden
      });
    }
    return out;
  }

  function normalize(arr, mod, figures) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    var first = arr[0] || {};
    var isQuizData = (first.question !== undefined || first.options !== undefined) && first.q === undefined;
    if (isQuizData) return fromQuizData(arr, mod.file, figures);
    // Already canonical. Copy only to resolve images; otherwise pass through so
    // nothing about order or content can drift.
    var needsWork = false;
    for (var i = 0; i < arr.length; i++) {
      var q = arr[i];
      if (q && (q.img || (q.fig && figures))) { needsWork = true; break; }
    }
    if (!needsWork) return arr;
    return arr.map(function (q) {
      if (!q || (!q.img && !q.fig)) return q;
      var copy = {};
      for (var k in q) if (Object.prototype.hasOwnProperty.call(q, k)) copy[k] = q[k];
      copy.img = imgFor(q, mod.file, figures);
      return copy;
    });
  }

  /**
   * Read one module's questions in canonical shape and source order.
   * Resolves to null when the module's source can't be read or parsed —
   * callers skip it rather than guessing at its contents.
   */
  function loadModuleQuestions(mod) {
    if (!mod || !mod.file) return Promise.resolve(null);
    var cacheKey = CACHE_PREFIX + mod.file;
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached != null) {
        var parsed = JSON.parse(cached);
        return Promise.resolve(Array.isArray(parsed) ? parsed : null);
      }
    } catch (e) { /* unreadable cache is just a cache miss */ }

    return fetch(mod.file).then(function (res) {
      if (mod.format === 'json') return res.json().then(function (a) { return { arr: a, figures: null }; });
      return res.text().then(function (html) {
        return {
          arr: extractArrayLiteral(html, 'QUESTIONS') || extractArrayLiteral(html, 'QUIZ_DATA'),
          figures: extractFigures(html)
        };
      });
    }).then(function (got) {
      var arr = got.arr;
      var out = normalize(arr, mod, got.figures);
      if (out) {
        // Quota is finite and these arrays are large; a failed write costs a
        // refetch, never correctness.
        try { sessionStorage.setItem(cacheKey, JSON.stringify(out)); } catch (e) {}
      }
      return out;
    }).catch(function () { return null; });
  }

  /** Topic string per question, in source order, or null if untagged. */
  function loadModuleTopics(mod) {
    return loadModuleQuestions(mod).then(function (arr) {
      if (!arr || typeof arr[0].s !== 'string') return null;
      return arr.map(function (q) { return q.s; });
    });
  }

  /**
   * Swap a quiz page's array literal for new text, leaving the rest of the
   * file untouched. Uses the same balanced scan as extraction, so a question
   * containing "];" cannot truncate the replacement — which a non-greedy
   * regex silently did.
   *
   * Returns null when the variable isn't there, so a caller can try the other
   * name rather than write a corrupted file.
   */
  function replaceArrayLiteral(html, varName, newLiteralText) {
    var marker = 'const ' + varName + ' = ';
    var idx = html.indexOf(marker);
    if (idx === -1) return null;
    var start = idx + marker.length;
    if (html[start] !== '[') return null;
    var end = extractBalanced(html, start);
    if (end === -1) return null;
    return html.slice(0, start) + newLiteralText + html.slice(end);
  }

  window.LEAQuizSource = {
    loadModuleQuestions: loadModuleQuestions,
    loadModuleTopics: loadModuleTopics,
    extractArrayLiteral: extractArrayLiteral,
    extractFigures: extractFigures,
    replaceArrayLiteral: replaceArrayLiteral,
    CACHE_PREFIX: CACHE_PREFIX
  };
})();

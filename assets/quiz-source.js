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
 *   { s, q, o[], c, ref?, n?, img?, hidden? }
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

  function extractArrayLiteral(html, varName) {
    var marker = 'const ' + varName + ' = ';
    var idx = html.indexOf(marker);
    if (idx === -1) return null;
    var start = idx + marker.length;
    if (html[start] !== '[') return null;
    var end = extractBalanced(html, start);
    if (end === -1) return null;
    try { return new Function('return ' + html.slice(start, end))(); } catch (e) { return null; }
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
  function fromQuizData(arr, modFile) {
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
        img: rebaseImg(row.img, modFile),
        hidden: !!row.hidden
      });
    }
    return out;
  }

  function normalize(arr, mod) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    var first = arr[0] || {};
    var isQuizData = (first.question !== undefined || first.options !== undefined) && first.q === undefined;
    if (isQuizData) return fromQuizData(arr, mod.file);
    // Already canonical. Copy only to rebase images; otherwise pass through so
    // nothing about order or content can drift.
    var needsRebase = false;
    for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].img) { needsRebase = true; break; } }
    if (!needsRebase) return arr;
    return arr.map(function (q) {
      if (!q || !q.img) return q;
      var copy = {};
      for (var k in q) if (Object.prototype.hasOwnProperty.call(q, k)) copy[k] = q[k];
      copy.img = rebaseImg(q.img, mod.file);
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
      if (mod.format === 'json') return res.json();
      return res.text().then(function (html) {
        return extractArrayLiteral(html, 'QUESTIONS') || extractArrayLiteral(html, 'QUIZ_DATA');
      });
    }).then(function (arr) {
      var out = normalize(arr, mod);
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

  window.LEAQuizSource = {
    loadModuleQuestions: loadModuleQuestions,
    loadModuleTopics: loadModuleTopics,
    extractArrayLiteral: extractArrayLiteral,
    CACHE_PREFIX: CACHE_PREFIX
  };
})();

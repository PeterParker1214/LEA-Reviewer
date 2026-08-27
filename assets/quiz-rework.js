/**
 * LEAQuizRework — reshapes a question set that already exists.
 *
 * Shared by tools/quiz-builder.html (standalone) and admin.html's "Rework
 * Module" tab, so the two can never drift apart. Everything here is
 * deterministic and offline: given the same rows and the same seed you get
 * the same module back.
 *
 * WHAT IT DOES NOT DO, deliberately:
 * It does not write questions and it does not paraphrase. It restructures
 * sentence frames it recognises ("Who pays X?" -> "X is paid by the:") and
 * REFUSES on anything else, reporting what it skipped. A rule can reshape a
 * frame; it cannot reword an idea. A version that rewrote everything by
 * swapping synonyms would turn a question set into thesaurus soup, which is
 * worse than leaving it alone.
 *
 * Canonical row shape is the site's own:
 *   { s, q, o[], c, ref, n }   plus optional img / hidden
 * An option may be a plain string OR the templated {ref:[i,j], tpl:'both'}
 * kind, whose ref[] indexes the option list — those indices are rebased
 * whenever choices move, or "Both A and B" silently names the wrong two.
 */
window.LEAQuizRework = (function () {
  'use strict';

  /* ---------------- deterministic rng ---------------- */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rnd) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- reading other formats ---------------- */
  function balanced(text, start, open) {
    var close = open === '[' ? ']' : '}', depth = 0, i, c, inStr = false, esc = false;
    for (i = start; i < text.length; i++) {
      c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (!depth) return text.slice(start, i + 1); }
    }
    return null;
  }
  function arrayLiteral(html, varName) {
    var re = new RegExp('(?:const|let|var)\\s+' + varName + '\\s*=\\s*\\[');
    var m = re.exec(html);
    return m ? balanced(html, m.index + m[0].length - 1, '[') : null;
  }

  /** Everything becomes the site's {s,q,o,c,ref,n} shape, or null if unusable. */
  function canonical(r) {
    if (!r || typeof r !== 'object') return null;
    var q = r.q !== undefined ? r.q : r.question;
    var opts = r.o || r.options;
    if (!q || !Object.prototype.toString.call(opts).match(/Array/) || opts.length < 2) return null;

    var letters = null;
    // Blueprint options are {letter,text}. Site options are plain strings
    // EXCEPT the templated {ref,tpl} kind, which must survive untouched.
    if (opts[0] && typeof opts[0] === 'object' && opts[0].text !== undefined) {
      letters = opts.map(function (o) { return o.letter; });
      opts = opts.map(function (o) { return o.text; });
    }

    var c = r.c;
    if (typeof c !== 'number') {
      var corr = r.correct;
      if (typeof corr === 'number') c = corr;
      else if (typeof corr === 'string' && letters) c = letters.indexOf(corr);
      else if (typeof corr === 'string') c = corr.toUpperCase().charCodeAt(0) - 65;
    }
    if (typeof c !== 'number' || c < 0 || c >= opts.length) return null;

    var n = r.n !== undefined ? r.n : (r.explanation || '');
    var ref = r.ref || '';
    // Blueprint files carry the source inside the explanation as "[Source: x]".
    var m = String(n).match(/\[Source:\s*([^\]]+)\]\s*$/i);
    if (m) { if (!ref) ref = m[1].trim(); n = n.slice(0, m.index).trim(); }

    var out = {
      s: r.s || r.subtopic || '',
      q: String(q).trim(),
      o: opts.map(function (x) { return (x && typeof x === 'object') ? x : String(x).trim(); }),
      c: c, ref: ref, n: String(n).trim()
    };
    if (r.img) out.img = r.img;
    if (r.hidden) out.hidden = true;
    return out;
  }

  /** Parse pasted JSON, a data/*.json module, or a quiz page. */
  function parseAny(text, label) {
    var trimmed = String(text || '').trim(), arr = null, kind = '';
    if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
      arr = JSON.parse(trimmed);
      if (!Array.isArray(arr) && Array.isArray(arr.questions)) arr = arr.questions;
      kind = 'json';
    } else {
      var names = [['QUIZ_DATA', 'blueprint'], ['QUESTIONS', 'site quiz']];
      for (var i = 0; i < names.length; i++) {
        var lit = arrayLiteral(text, names[i][0]);
        if (lit) { arr = JSON.parse(lit); kind = names[i][1]; break; }
      }
    }
    if (!Array.isArray(arr) || !arr.length)
      throw new Error('No question array found in ' + (label || 'that input') + '.');
    var rows = arr.map(canonical).filter(Boolean);
    if (!rows.length) throw new Error('Found an array but no usable questions in it.');
    return { rows: rows, kind: kind };
  }

  /* ---------------- stem restructuring ---------------- */
  var NUMERIC = /[0-9₱%]/;
  function upper1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var RULES = [
    {
      name: 'compute',
      // "What is the PCC?" -> "Compute the PCC." Only where a figure is asked
      // for; elsewhere "compute" is nonsense.
      test: function (s) { return /^What (?:is|are) (the .+?)\?$/i.test(s) && NUMERIC.test(s); },
      apply: function (s) { return 'Compute ' + s.match(/^What (?:is|are) (the .+?)\?$/i)[1].trim() + '.'; }
    },
    {
      name: 'nominalise',
      // "What is the recommended fee for X?" -> "The recommended fee for X is:"
      test: function (s) { return /^What (is|are) (the .+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^What (is|are) (the .+?)\?$/i);
        return upper1(m[2].trim()) + ' ' + m[1].toLowerCase() + ':';
      }
    },
    {
      name: 'passive-agent',
      // "Who prepares Change Orders?" -> "Change Orders are prepared by the:"
      test: function (s) { return /^Who (prepares|pays|issues|approves|signs|bears|shoulders) (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^Who (prepares|pays|issues|approves|signs|bears|shoulders) (.+?)\?$/i);
        var past = { prepares: 'prepared', pays: 'paid', issues: 'issued', approves: 'approved',
                     signs: 'signed', bears: 'borne', shoulders: 'borne' }[m[1].toLowerCase()];
        var subj = m[2].trim();
        return upper1(subj) + ' ' + (/s$/.test(subj) ? 'are' : 'is') + ' ' + past + ' by the:';
      }
    },
    {
      name: 'when-upon',
      // "When is the final payment released?" -> "The final payment is released upon:"
      test: function (s) { return /^When (is|are) (.+?) (released|due|payable|paid|issued)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^When (is|are) (.+?) (released|due|payable|paid|issued)\?$/i);
        return upper1(m[2].trim()) + ' ' + m[1].toLowerCase() + ' ' + m[3].toLowerCase() + ' upon:';
      }
    },
    {
      name: 'trailing-colon',
      test: function (s) { return /^(.+?) (includes|covers|requires|means) what\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^(.+?) (includes|covers|requires|means) what\?$/i);
        return upper1(m[1].trim()) + ' ' + m[2].toLowerCase() + ':';
      }
    }
  ];

  function restructure(stem) {
    var s = String(stem || '').trim();
    if (!s) return { text: stem, rule: null, why: 'empty' };
    if (s.length > 240) return { text: s, rule: null, why: 'long scenario — rewrite by hand' };
    for (var i = 0; i < RULES.length; i++) {
      if (!RULES[i].test(s)) continue;
      var out;
      try { out = RULES[i].apply(s); } catch (e) { continue; }
      if (!out || out.length < s.length * 0.45) continue;
      if (/[?:.]{2,}$/.test(out)) continue;
      // Reject a dangling article or preposition — except "by the:", which is
      // the natural ending for an agent question.
      if (/\b(?:a|an|of|for|to)\s*[:.]$/i.test(out)) continue;
      if (/\bthe\s*[:.]$/i.test(out) && !/\bby the\s*[:.]$/i.test(out)) continue;
      return { text: out, rule: RULES[i].name, why: null };
    }
    return { text: s, rule: null, why: 'no safe frame matched' };
  }

  /* ---------------- re-sequencing ---------------- */
  function scoreOrder(perm, minGap) {
    var n = perm.length, where = new Array(n), i, d, close = 0, sum = 0, adj = 0;
    perm.forEach(function (orig, pos) { where[orig] = pos; });
    for (i = 0; i < n; i++) {
      d = Math.abs(where[i] - i);
      sum += d; if (d < minGap) close++;
      if (i < n - 1 && Math.abs(where[i] - where[i + 1]) === 1) adj++;
    }
    var mins = perm.map(function (o, p) { return Math.abs(p - where[o]); });
    return { bad: close * 10 + adj * 6 - sum / n,
             mean: Math.round(sum / n * 10) / 10,
             min: Math.min.apply(null, mins), close: close, adj: adj };
  }
  function bestOrder(n, rnd) {
    var all = [], i;
    for (i = 0; i < n; i++) all.push(i);
    if (n < 3) return { perm: all, stats: scoreOrder(all, 1) };
    var minGap = Math.max(2, Math.floor(n / 10));
    var best = null, bestBad = Infinity, bestStats = null;
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    for (var t = 0; t < 400; t++) {
      var perm;
      if (t % 2 === 0) {
        var step = 2 + Math.floor(rnd() * Math.max(1, n - 2));
        if (gcd(step, n) !== 1) continue;
        var rot = Math.floor(rnd() * n);
        perm = all.map(function (j) { return (rot + j * step) % n; });
      } else {
        perm = shuffled(all, rnd);
      }
      var st = scoreOrder(perm, minGap);
      if (st.bad < bestBad) { bestBad = st.bad; best = perm; bestStats = st; }
    }
    return { perm: best || all, stats: bestStats || scoreOrder(all, minGap) };
  }

  /* ---------------- the whole job ---------------- */
  function build(loaded, opts) {
    opts = opts || {};
    var rnd = mulberry(parseInt(opts.seed, 10) || 42);
    var doRewrite = opts.rewrite !== false;
    var doShuffle = opts.shuffleOptions !== false;
    var doReorder = opts.reorder !== false;

    var rewritten = [], skipped = [];
    var rows = loaded.map(function (r, i) {
      var out = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) out[k] = r[k];

      if (doRewrite) {
        var res = restructure(r.q);
        if (res.rule) { out.q = res.text; rewritten.push({ i: i, from: r.q, to: res.text, rule: res.rule }); }
        else skipped.push({ i: i, q: r.q, why: res.why });
      }

      if (doShuffle && Array.isArray(out.o) && out.o.length > 1) {
        var idxArr = [];
        for (var z = 0; z < out.o.length; z++) idxArr.push(z);
        var idx = shuffled(idxArr, rnd);            // newPos -> oldPos
        var oldToNew = new Array(idx.length);
        idx.forEach(function (oldPos, newPos) { oldToNew[oldPos] = newPos; });
        out.o = idx.map(function (k2) {
          var opt = r.o[k2];
          if (opt && typeof opt === 'object' && Array.isArray(opt.ref)) {
            var copy = {};
            for (var kk in opt) if (Object.prototype.hasOwnProperty.call(opt, kk)) copy[kk] = opt[kk];
            copy.ref = opt.ref.map(function (x) { return oldToNew[x]; }).sort(function (a, b) { return a - b; });
            return copy;
          }
          return opt;
        });
        out.c = oldToNew[r.c];
      }
      return out;
    });

    var stats = null;
    if (doReorder) {
      var r2 = bestOrder(rows.length, rnd);
      var seq = new Array(rows.length);
      r2.perm.forEach(function (orig, pos) { seq[pos] = rows[orig]; });
      rows = seq; stats = r2.stats;
    }

    // Integrity: the key must still select the same answer. Templated options
    // are compared by the SET of options they point at, since their indices
    // are meant to change.
    function answerOf(row) {
      var opt = row.o[row.c];
      if (opt && typeof opt === 'object' && Array.isArray(opt.ref))
        return opt.tpl + ':' + opt.ref.map(function (i) { return JSON.stringify(row.o[i]); }).sort().join('|');
      return JSON.stringify(opt);
    }
    var pool = loaded.slice(), checked = 0, keyOk = rows.length === loaded.length;
    if (keyOk) {
      for (var a = 0; a < rows.length; a++) {
        var r3 = rows[a];
        var k3 = -1;
        for (var b = 0; b < pool.length; b++) {
          if (pool[b].n === r3.n && pool[b].ref === r3.ref) { k3 = b; break; }
        }
        if (k3 === -1) continue;
        var src = pool.splice(k3, 1)[0];
        checked++;
        if (answerOf(src) !== answerOf(r3)) { keyOk = false; break; }
      }
    }

    var templated = rows.filter(function (r4) {
      return r4.o.some(function (o) { return o && typeof o === 'object'; });
    }).length;

    return { rows: rows, rewritten: rewritten, skipped: skipped, stats: stats,
             keyOk: keyOk, checked: checked, templated: templated };
  }

  return { canonical: canonical, parseAny: parseAny, restructure: restructure,
           build: build, mulberry: mulberry, shuffled: shuffled };
})();

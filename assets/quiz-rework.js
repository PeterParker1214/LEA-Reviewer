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
 *   { s, q, o[], c, ref, n }   plus optional img / scenario / hidden
 * An option may be a plain string OR the templated {ref:[i,j], tpl:'both'}
 * kind, whose ref[] indexes the option list — those indices are rebased
 * whenever choices move, or "Both A and B" silently names the wrong two.
 * `scenario` is shared reference text — a text figure — usually repeated
 * verbatim across a run of consecutive questions; it plays no part in
 * reworking and is only ever carried through untouched.
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

  /* ---------------- scenario detection ---------------- */
  // Some sources carry the scenario inline inside the question text rather
  // than as its own field — "Scenario: <ref text>" followed by either an
  // explicit "Question:" marker or a blank line, then the real question.
  // Only ever split on that explicit convention: a stem that merely happens
  // to start with the word "Scenario" some other way is left exactly as
  // written, so nothing in the existing bank (none of it starts this way)
  // can be clipped by accident.
  var SCENARIO_INLINE_RE = /^Scenario\s*:\s*([\s\S]+?)(?:\n\s*\n+|\bQuestion\s*:\s*)([\s\S]+)$/i;
  function splitEmbeddedScenario(text) {
    var m = SCENARIO_INLINE_RE.exec(String(text || '').trim());
    if (!m) return null;
    var scenario = m[1].trim(), question = m[2].trim();
    if (!scenario || !question) return null;
    return { scenario: scenario, q: question };
  }

  /** Everything becomes the site's {s,q,o,c,ref,n} shape, or null if unusable. */
  // Source documents number their questions, and that numbering comes through
  // the .docx reader inside the stem: "36. A foreign architect wants to...".
  // On the site it is wrong twice over — the runner shows its own position, and
  // reworking reorders the questions, so a stem numbered 36 turns up ninth.
  //
  // Only a small integer followed by a dot or bracket AND a space is taken as
  // numbering, so "3.5 m" and "1987 Constitution" are left alone.
  function stripLeadingNumber(text) {
    return String(text == null ? '' : text).replace(/^\s*\(?\d{1,3}\s*[.)]\s+/, '');
  }

  function canonical(r) {
    if (!r || typeof r !== 'object') return null;
    var q = r.q !== undefined ? r.q : r.question;
    q = stripLeadingNumber(q);
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
    if (r.scenario) {
      out.scenario = String(r.scenario).trim();
    } else {
      var inline = splitEmbeddedScenario(out.q);
      if (inline) { out.scenario = inline.scenario; out.q = inline.q; }
    }
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

  /* ---------------- stem reframing ---------------- */
  //
  // REFRAMING, NOT PARAPHRASING. Every rule below moves the sentence into a
  // different frame while keeping its words: "How is water categorised?"
  // becomes "On what basis is water categorised?". No synonym is ever
  // substituted, because that is how you end up with thesaurus prose.
  //
  // Each rule is a tight pattern plus guards, and the whole set REFUSES on
  // anything it does not recognise rather than guessing. Skipped stems are
  // reported so they can be reworded by hand.

  var NUMERIC = /[0-9₱%]/;

  // Whether an item actually asks for a figure. Judged from the CHOICES, not
  // the stem: "an R2 project" has a digit in it and asks for no arithmetic.
  function optionsAreNumeric(opts) {
    if (!opts || !opts.length) return false;
    var numeric = opts.filter(function (o) {
      if (o && typeof o === 'object') return false;
      return /^[^A-Za-z]*[\d][\d,.\s]*(?:mm|cm|m|m2|sqm|sq\.?m|ha|%|hrs?|hours?|days?|pcs|sets?|units?|storeys?|floors?|persons?|pesos?|million|billion|M|B)?[^A-Za-z]*$/i.test(String(o).trim());
    }).length;
    return numeric >= Math.ceil(opts.length * 0.75);
  }

  function upper1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Lowercase the first letter ONLY when it is capitalised merely for being
  // first. "Any physical change" -> "any physical change", but "PD 1096",
  // "RA 9266" and "Architect" keep their capitals.
  function softLower(s) {
    if (!s) return s;
    var first = s.split(/\s+/)[0].replace(/[^\w-]/g, '');
    if (!/^[A-Z][a-z]+$/.test(first)) return s;         // acronym / all-caps / mixed
    var PROPER = /^(Architect|Owner|Client|Contractor|Building|Code|Rule|Section|Philippine|National|Supplier|Manila)$/;
    if (PROPER.test(first)) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function strip(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
  function noDot(s) { return strip(s).replace(/[.?:]+$/, ''); }

  var RULES = [
    // ---- questions that stay questions, reframed ----
    {
      name: 'how-basis',
      // "How does one categorize water potability?" ->
      // "On what basis is water potability categorized?"
      test: function (s) { return /^How (?:does one|do you|do we|is|are) .+\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^How (?:does one|do you|do we) (\w+)\s+(.+)\?$/i);
        if (m) return 'On what basis is ' + noDot(m[2]) + ' ' + m[1].toLowerCase() +
                      (/e$/i.test(m[1]) ? 'd' : 'ed') + '?';
        m = s.match(/^How (is|are) (.+?) (\w+ed)\?$/i);
        if (m) return 'On what basis ' + m[1].toLowerCase() + ' ' + noDot(m[2]) + ' ' + m[3].toLowerCase() + '?';
        return null;
      }
    },
    {
      name: 'according-to',
      // "According to the NBC, what is the maximum cost of X?" ->
      // "Under the NBC, the maximum cost of X is:"
      test: function (s) { return /^(?:According to|Under|Per) (.+?), what (?:is|are) (the .+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^(?:According to|Under|Per) (.+?), what (is|are) (the .+?)\?$/i);
        return 'Under ' + noDot(m[1]) + ', ' + softLower(noDot(m[3])) + ' ' + m[2].toLowerCase() + ':';
      }
    },
    {
      name: 'requires-which',
      // "Which of the following requires a building permit?" ->
      // "A building permit is required for which of the following?"
      test: function (s) { return /^Which of the following (requires?|needs?|is exempt from|are exempt from) (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^Which of the following (requires?|needs?|is exempt from|are exempt from) (.+?)\?$/i);
        var verb = m[1].toLowerCase();
        var obj = noDot(m[2]);
        if (/exempt/.test(verb)) return 'Exemption from ' + softLower(obj) + ' applies to which of the following?';
        return upper1(obj) + ' is ' + (/^require/.test(verb) ? 'required' : 'needed') +
               ' for which of the following?';
      }
    },
    {
      name: 'this-person',
      // "This person is tasked with X. He/she does Y." -> "Who is tasked with X?"
      test: function (s) { return /^This (?:person|official|professional) is (tasked with|responsible for|charged with) /i.test(s); },
      apply: function (s) {
        var m = s.match(/^This (?:person|official|professional) is (tasked with|responsible for|charged with) (.+)$/i);
        var rest = m[2].split(/\.\s+/)[0];
        return 'Who is ' + m[1].toLowerCase() + ' ' + noDot(rest) + '?';
      }
    },
    {
      name: 'except-list',
      // "The following are X EXCEPT:" -> "Which of these is NOT X?"
      test: function (s) { return /^(?:The following|All of the following) (?:are|is) (.+?)\s+EXCEPT\b/i.test(s); },
      apply: function (s) {
        var m = s.match(/^(?:The following|All of the following) (?:are|is) (.+?)\s+EXCEPT\b/i);
        return 'Which of these is NOT ' + softLower(noDot(m[1])) + '?';
      }
    },
    {
      name: 'best-describes',
      // "Which best describes X?" -> "X is best described as:"
      test: function (s) { return /^Which (?:one )?best describes (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^Which (?:one )?best describes (.+?)\?$/i);
        return upper1(noDot(m[1])) + ' is best described as:';
      }
    },
    // A "why-reason" rule used to live here and has been removed. Turning
    // "Why is X historically significant?" into a statement needs the verb put
    // back between the subject and the predicate, and a regex cannot find that
    // boundary — it produced "The reason the Tabon Cave Complex historically
    // significant is so:". Leaving these stems alone is the correct outcome.
    {
      name: 'where-located',
      test: function (s) { return /^Where (is|are) (.+?)(?: located)?\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^Where (is|are) (.+?)(?: located)?\?$/i);
        return upper1(noDot(m[2])) + ' ' + m[1].toLowerCase() + ' found:';
      }
    },
    {
      name: 'compute',
      test: function (s, opts) { return /^What (?:is|are) (the .+?)\?$/i.test(s) && optionsAreNumeric(opts); },
      apply: function (s) { return 'Compute ' + noDot(s.match(/^What (?:is|are) (the .+?)\?$/i)[1]) + '.'; }
    },
    {
      name: 'nominalise',
      test: function (s) { return /^What (is|are) (the .+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^What (is|are) (the .+?)\?$/i);
        var body = noDot(m[2]);
        // Move a trailing ", according to X" to the front, or the sentence ends
        // "...handrails, according to the Building Code is:" — missing a comma
        // and reading as nonsense.
        var tail = body.match(/^(.+?),\s*(?:according to|per|under)\s+(.+)$/i);
        if (tail) return 'Under ' + noDot(tail[2]) + ', ' + softLower(noDot(tail[1])) + ' ' + m[1].toLowerCase() + ':';
        if (/,\s*\w/.test(body.slice(-40))) return null;   // other trailing clause: leave alone
        // "...if the occupant load is 15" + " is:" reads as "15 is:". Leave
        // stems that already end mid-clause alone.
        if (/\d$/.test(body) || /\b(is|are|was|were)\s+\S+$/i.test(body)) return null;
        return upper1(body) + ' ' + m[1].toLowerCase() + ':';
      }
    },
    {
      name: 'passive-agent',
      test: function (s) { return /^Who (prepares|pays|issues|approves|signs|bears|shoulders|enforces|prepares for) (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^Who (prepares|pays|issues|approves|signs|bears|shoulders|enforces) (.+?)\?$/i);
        if (!m) return null;
        var past = { prepares: 'prepared', pays: 'paid', issues: 'issued', approves: 'approved',
                     signs: 'signed', bears: 'borne', shoulders: 'borne', enforces: 'enforced' }[m[1].toLowerCase()];
        var subj = noDot(m[2]);
        return upper1(subj) + ' ' + (/s$/.test(subj) && !/ss$/.test(subj) ? 'are' : 'is') + ' ' + past + ' by the:';
      }
    },
    {
      name: 'when-upon',
      test: function (s) { return /^When (is|are) (.+?) (released|due|payable|paid|issued|required|granted)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^When (is|are) (.+?) (released|due|payable|paid|issued|required|granted)\?$/i);
        return upper1(noDot(m[2])) + ' ' + m[1].toLowerCase() + ' ' + m[3].toLowerCase() + ' upon:';
      }
    },
    {
      name: 'trailing-colon',
      test: function (s) { return /^(.+?) (includes|covers|requires|means) what\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^(.+?) (includes|covers|requires|means) what\?$/i);
        return upper1(noDot(m[1])) + ' ' + m[2].toLowerCase() + ':';
      }
    },
    {
      name: 'how-many-much',
      // "How many sets of plans must be submitted?" ->
      // "The number of sets of plans that must be submitted is:"
      test: function (s) { return /^How (many|much) (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^How (many|much) (.+?)\?$/i);
        var head = m[1].toLowerCase() === 'many' ? 'The number of ' : 'The amount of ';
        return head + noDot(m[2]) + ' is:';
      }
    },
    {
      name: 'in-context',
      // "In X, what is Y?" -> "Within X, Y is:"
      test: function (s) { return /^In (.+?), what (?:is|are) (.+?)\?$/i.test(s); },
      apply: function (s) {
        var m = s.match(/^In (.+?), what (is|are) (.+?)\?$/i);
        return 'Within ' + noDot(m[1]) + ', ' + softLower(noDot(m[3])) + ' ' + m[2].toLowerCase() + ':';
      }
    },

    // ---- statements that become questions ----
    {
      name: 'definition-to-question',
      // Review banks state definitions flat: "Any physical change made on a
      // building to increase its value." -> "Which term refers to any physical
      // change made on a building to increase its value?"
      // "This type of construction is four-hour fire-resistive." becomes
      // "Which type of construction is four-hour fire-resistive?" — reusing the
      // noun the sentence already names, rather than stacking a second lead-in
      // on top of one that is already there.
      test: function (s) {
        return !/\?$/.test(s) && !/:$/.test(s) &&
               /^(?:Any|A|An|The|This|These|It|Refers to|Term for)\b/i.test(s) &&
               s.split(/\s+/).length >= 5 && s.split(/\s+/).length <= 45;
      },
      apply: function (s) {
        var body = noDot(s);
        // "This/The <noun phrase> is|are ..." -> "Which <noun phrase> is|are ...?"
        var m = body.match(/^(?:This|These|The)\s+((?:\w+\s+){0,3}?\w+)\s+(is|are)\s+(.+)$/i);
        if (m && !/^term\b/i.test(m[1])) {
          return 'Which ' + m[1].toLowerCase() + ' ' + m[2].toLowerCase() + ' ' + m[3] + '?';
        }
        // Peel any existing "(This) term refers to" lead-in before adding ours.
        body = body.replace(/^(?:this\s+|the\s+)?term\s+refers\s+to\s+/i, '')
                   .replace(/^refers\s+to\s+/i, '');
        return 'Which term refers to ' + softLower(body) + '?';
      }
    },
    {
      name: 'statement-to-question',
      // A declarative statement of fact -> "Which of these is correct?" is
      // useless, so instead turn a trailing definition-ish statement into an
      // identification prompt only when it names no subject of its own.
      test: function (s) {
        return !/\?$/.test(s) && !/:$/.test(s) &&
               /\b(is|are)\b/.test(s) &&
               s.split(/\s+/).length >= 6 && s.split(/\s+/).length <= 40 &&
               /^(?:Compensation|Payment|Fees?|Charges?|Services?|Work|Plans?|Permits?)\b/i.test(s);
      },
      apply: function (s) {
        var body = noDot(s);
        var m = body.match(/^(.+?)\s+(?:is|are)\s+(.+)$/i);
        if (!m) return null;
        return upper1(m[1]) + ' — which of the following applies?';
      }
    }
  ];

  function restructure(stem, opts) {
    var s = strip(stem);
    if (!s) return { text: stem, rule: null, why: 'empty' };
    if (s.length > 300) return { text: s, rule: null, why: 'long scenario — rewrite by hand' };

    for (var i = 0; i < RULES.length; i++) {
      if (!RULES[i].test(s, opts)) continue;
      var out;
      try { out = RULES[i].apply(s); } catch (e) { continue; }
      if (!out) continue;
      out = strip(out);

      // ---- guards: refuse anything that came out malformed ----
      if (out === s) continue;                                   // no-op
      if (out.length < s.length * 0.4) continue;                 // lost content
      if (out.length > s.length * 2.2) continue;                 // ballooned
      if (/[?:.]{2,}$/.test(out)) continue;                      // doubled punctuation
      if (/\s[?:.]/.test(out)) continue;                         // floating punctuation
      if (/\b(?:a|an|of|for|to|and|or|with|in|on)\s*[:.?]$/i.test(out)) continue;
      if (/\bthe\s*[:.?]$/i.test(out) && !/\bby the\s*[:.?]$/i.test(out)) continue;
      if (/\b(is|are|was|were)\s+(is|are|was|were)\b/i.test(out)) continue;  // "is is"
      if (/\?\s*\w/.test(out)) continue;                          // text after the ?
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
      // Carry the source position through, so the answer-key check can compare
      // each row against the one it actually came from. Matching on content
      // instead looked fine until a module turned up with no explanations and
      // no sources at all — 182 identical keys, and every comparison wrong.
      // Stripped again before this leaves the function.
      out.__src = i;

      if (doRewrite) {
        var res = restructure(r.q, r.o);
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
    var checked = 0, keyOk = rows.length === loaded.length, failedAt = -1;
    if (keyOk) {
      for (var a = 0; a < rows.length; a++) {
        var r3 = rows[a];
        var src = loaded[r3.__src];
        if (!src) { keyOk = false; failedAt = a; break; }
        checked++;
        if (answerOf(src) !== answerOf(r3)) { keyOk = false; failedAt = a; break; }
      }
    }
    // The tracking index is ours, not the site's — never let it reach a file.
    rows.forEach(function (r5) { delete r5.__src; });

    var templated = rows.filter(function (r4) {
      return r4.o.some(function (o) { return o && typeof o === 'object'; });
    }).length;

    return { rows: rows, rewritten: rewritten, skipped: skipped, stats: stats,
             keyOk: keyOk, checked: checked, templated: templated };
  }

  return { canonical: canonical, stripLeadingNumber: stripLeadingNumber, parseAny: parseAny, restructure: restructure,
           build: build, mulberry: mulberry, shuffled: shuffled,
           splitEmbeddedScenario: splitEmbeddedScenario };
})();

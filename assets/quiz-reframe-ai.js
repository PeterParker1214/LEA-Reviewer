/**
 * LEAReframeAI — reframes question stems using a model running on this machine.
 *
 * WHY THIS IS SAFE, AND WHY THE RULE ENGINE STAYS
 * The model is shown ONE question sentence and asked for another sentence. It
 * never sees the choices and never sees which one is correct, so it cannot
 * change an answer — there is no path from here to the answer key. The worst
 * it can do is write an awkward question, which you see in the preview.
 *
 * What it returns is not trusted. Every reply is checked against the original
 * before it is accepted: numbers, money, units, law citations and section
 * marks must all still be there, the length must be sane, and it must not have
 * answered the question or wrapped its reply in chatter. Anything that fails
 * is thrown away and the original stem is kept. A dropped "₱15,000" would
 * quietly break a question, so that is the check that matters most.
 *
 * Nothing leaves the machine: this talks to http://localhost:11434.
 */
window.LEAReframeAI = (function () {
  'use strict';

  var HOST = 'http://localhost:11434';
  var DEFAULT_MODEL = 'llama3.1:8b';

  var PROMPT = [
    'Rewrite this multiple-choice exam question so it asks exactly the same thing',
    'using a different sentence structure.',
    '',
    'Rules:',
    '- Keep every number, measurement, currency amount, percentage, law citation',
    '  and technical term EXACTLY as written. Do not convert or reword them.',
    '- Do not answer the question or hint at the answer.',
    '- Do not add information that is not there, and do not drop any.',
    '- One sentence. Similar length to the original.',
    '- Reply with ONLY the rewritten question. No preamble, no quotes, no notes.',
    '',
    'Question: '
  ].join('\n');

  /* ---------------- what must survive the rewrite ---------------- */
  // Tokens whose loss would change what the question is asking.
  function anchors(text) {
    var out = [];
    var pats = [
      /[₱$]\s?[\d][\d,.]*/g,                       // money
      /\b\d[\d,.]*\s?(?:%|sqm|sq\.?m|m2|mm|cm|m|km|ha|hrs?|hours?|days?|years?|storeys?|floors?|persons?|sets?|units?)\b/gi,
      /\b(?:R\.?A\.?|P\.?D\.?|B\.?P\.?|E\.?O\.?)\s?\d+[\w-]*/gi,  // statutes
      /§+\s?[\d.]+/g,                              // section marks
      /\b(?:Rule|Section|Sec\.?|Article|Art\.?|Doc\.?|Group)\s+[IVXLC\d][\w.-]*/gi,
      /\b\d[\d,.]*\b/g                             // any bare number, last resort
    ];
    pats.forEach(function (p) {
      var m = String(text || '').match(p);
      if (m) m.forEach(function (x) { out.push(x.replace(/\s+/g, '').toLowerCase()); });
    });
    return out;
  }

  var CHATTER = /^(sure|here|okay|ok|certainly|of course|rewritten|question:|answer:)\b/i;

  /**
   * Decide whether a reply may replace the original. Returns null when it is
   * acceptable, or a short reason when it is not.
   */
  function reject(original, reply) {
    var r = String(reply || '').trim();
    if (!r) return 'empty reply';
    // Models like to wrap answers in quotes; unwrap once before judging.
    r = r.replace(/^["“”']\s*/, '').replace(/\s*["“”']$/, '').trim();
    if (!r) return 'empty after unwrapping';
    if (/\n/.test(r)) return 'multiple lines';
    if (CHATTER.test(r)) return 'wrapped in chatter';
    if (r.toLowerCase() === String(original).trim().toLowerCase()) return 'unchanged';
    if (r.length < original.length * 0.5) return 'too short — information probably dropped';
    if (r.length > original.length * 1.9) return 'too long — information probably added';
    if (/\b(the answer is|correct answer|option [A-D]\b)/i.test(r)) return 'answered the question';

    var want = anchors(original), got = anchors(r);
    for (var i = 0; i < want.length; i++) {
      if (got.indexOf(want[i]) === -1) return 'lost "' + want[i] + '"';
    }
    return null;
  }

  function clean(reply) {
    return String(reply).trim()
      .replace(/^["“”']\s*/, '').replace(/\s*["“”']$/, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------------- talking to the local server ---------------- */
  function available(timeoutMs) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, timeoutMs || 2500);
    return fetch(HOST + '/api/tags', { signal: ctl.signal })
      .then(function (r) { clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function (j) {
        return j ? { ok: true, models: (j.models || []).map(function (m) { return m.name; }) }
                 : { ok: false, models: [] };
      })
      .catch(function () { clearTimeout(t); return { ok: false, models: [] }; });
  }

  function askOne(stem, model, seed) {
    return fetch(HOST + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        prompt: PROMPT + stem,
        stream: false,
        options: { temperature: 0.3, top_p: 0.9, seed: seed || 42, num_predict: 160 }
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('local model returned ' + r.status);
      return r.json();
    }).then(function (j) { return j.response || ''; });
  }

  /**
   * Reframe every stem in `rows`. Never mutates the input.
   * onProgress(done, total) is called as it goes — this is not instant.
   * Resolves { stems: [...], accepted, rejected: [{i, why, got}] }.
   */
  function reframeAll(rows, opts) {
    opts = opts || {};
    var model = opts.model || DEFAULT_MODEL;
    var seed = opts.seed || 42;
    var onProgress = opts.onProgress || function () {};
    var stems = rows.map(function (r) { return r.q; });
    var accepted = 0, rejected = [];

    var i = 0;
    function step() {
      if (i >= rows.length || opts.cancelled && opts.cancelled()) {
        return Promise.resolve({ stems: stems, accepted: accepted, rejected: rejected });
      }
      var idx = i++;
      var original = rows[idx].q;
      return askOne(original, model, seed + idx)
        .then(function (reply) {
          var why = reject(original, reply);
          if (why) rejected.push({ i: idx, why: why, got: clean(reply).slice(0, 90) });
          else { stems[idx] = clean(reply); accepted++; }
        })
        .catch(function (e) { rejected.push({ i: idx, why: e.message, got: '' }); })
        .then(function () { onProgress(idx + 1, rows.length); return step(); });
    }
    return step();
  }

  return { available: available, reframeAll: reframeAll, reject: reject,
           anchors: anchors, HOST: HOST, DEFAULT_MODEL: DEFAULT_MODEL };
})();

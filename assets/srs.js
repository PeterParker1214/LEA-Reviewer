/* LEA Reviewer — flashcards: deck builder + spaced-repetition scheduler.
 *
 * Pure functions, no DOM, so tools/tests/flashcards.test.js can run them in
 * Node. cards.html is the page that draws them.
 *
 * SCHEDULE (SM-2, the algorithm Anki grew from)
 *   New cards step through 1 min then 10 min; Good on the last step graduates
 *   to 1 day, Easy graduates straight to 4 days.
 *   A graduated card's interval multiplies by its ease (starts 2.5): Hard x1.2,
 *   Good x ease, Easy x ease x1.3. Again sends it back to a 10-minute step and
 *   lowers the ease by 0.2 (never below 1.3), so missed cards come back sooner
 *   for good.
 *
 * DECKS are declared in data/subjects.json (subject.decks[]), never in code:
 *   { id, title, source, lookup?, lookupPattern?, notePattern?, credit, license }
 *   source  — a question-bank file whose rows carry img + the answer (o[c]).
 *   lookup  — optional second bank answering "Who designed X?" for the name.
 * A new deck in the same shape is a manifest edit only.
 */
(function (root) {
  'use strict';
  var MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  var STEPS = [1 * MIN, 10 * MIN];   // learning steps for new cards
  var RELEARN = 10 * MIN;            // step after a lapse
  var EF0 = 2.5, EF_MIN = 1.3;

  // ---------- deck ----------
  function cardId(row, i) {
    var m = /([^/]+)\.[a-z0-9]+$/i.exec(row.img || '');
    return m ? m[1] : 'r' + i;
  }

  function buildDeck(cfg, rows, lookupRows) {
    var note = new RegExp(cfg.notePattern || 'designed by (.+?)(?: \\(|\\.?$)');
    var ask = new RegExp(cfg.lookupPattern || '^Who designed (.+)\\?$');
    var who = {};
    (lookupRows || []).forEach(function (q) {
      var m = ask.exec(q.q || '');
      if (m && q.o && q.o[q.c] != null) who[m[1].trim()] = q.o[q.c];
    });
    var cards = [], skipped = [];
    (rows || []).forEach(function (q, i) {
      var name = q.o && q.o[q.c];
      var id = cardId(q, i);
      var m = q.n && note.exec(q.n);
      var architect = q.architect || (m && m[1].trim()) || (name && who[name]) || '';
      var reason = !q.img ? 'no picture' : !name ? 'no name' : !architect ? 'no architect or proponent in the bank' : '';
      if (reason) { skipped.push({ id: id, name: name || '', reason: reason }); return; }
      cards.push({
        id: id, img: q.img, name: name, architect: architect,
        year: q.yr ? String(q.yr) : '',
        credit: q.credit || cfg.credit || '', license: q.license || cfg.license || ''
      });
    });
    return { cards: cards, skipped: skipped };
  }

  // ---------- scheduler ----------
  // state: { q: 0 new | 1 learning | 2 review | 3 relearning, st: step,
  //          ivl: days, ef, due: ms, lapses, reps, u: ms last rated }
  function fresh() { return { q: 0, st: 0, ivl: 0, ef: EF0, due: 0, lapses: 0, reps: 0, u: 0 }; }

  function schedule(s, r, now) {
    s = Object.assign(fresh(), s || {});
    var n = Object.assign({}, s, { reps: s.reps + 1, u: now });
    if (s.q === 0 || s.q === 1) {
      var st = s.q === 0 ? 0 : s.st;
      if (r === 1) { n.q = 1; n.st = 0; n.due = now + STEPS[0]; }
      else if (r === 2) { n.q = 1; n.st = st; n.due = now + (STEPS[st] + (STEPS[st + 1] || STEPS[st] * 2)) / 2; }
      else if (r === 3 && st + 1 < STEPS.length) { n.q = 1; n.st = st + 1; n.due = now + STEPS[st + 1]; }
      else { n.q = 2; n.st = 0; n.ivl = r === 4 ? 4 : 1; n.due = now + n.ivl * DAY; }
      return n;
    }
    if (s.q === 3) {
      if (r === 1) { n.due = now + RELEARN; return n; }
      if (r === 2) { n.due = now + RELEARN * 1.5; return n; }
      n.q = 2; n.ivl = r === 4 ? s.ivl + 1 : s.ivl; n.due = now + n.ivl * DAY; return n;
    }
    // review
    if (r === 1) {
      n.q = 3; n.lapses = s.lapses + 1; n.ef = Math.max(EF_MIN, s.ef - 0.2);
      n.ivl = 1; n.due = now + RELEARN; return n;
    }
    var hard = Math.max(s.ivl + 1, s.ivl * 1.2);
    var good = Math.max(hard + 1, s.ivl * s.ef);
    var easy = Math.max(good + 1, s.ivl * s.ef * 1.3);
    n.ivl = Math.round(r === 2 ? hard : r === 3 ? good : easy);
    n.ef = Math.max(EF_MIN, s.ef + (r === 2 ? -0.15 : r === 4 ? 0.15 : 0));
    n.due = now + n.ivl * DAY;
    return n;
  }

  function preview(s, now) {
    return [1, 2, 3, 4].map(function (r) { return schedule(s, r, now).due - now; });
  }

  function fmt(ms) {
    var m = ms / MIN;
    if (m < 60) return Math.max(1, Math.round(m)) + ' min';
    if (m < 60 * 24) return Math.round(m / 60) + ' h';
    var d = ms / DAY;
    if (d < 30) return Math.round(d) + (Math.round(d) === 1 ? ' day' : ' days');
    if (d < 365) return (d / 30).toFixed(1).replace(/\.0$/, '') + ' mo';
    return (d / 365).toFixed(1).replace(/\.0$/, '') + ' yr';
  }

  // ---------- queue ----------
  function dayKey(now) {
    var d = new Date(now);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function isWeak(s) { return !!s && s.q !== 0 && (s.lapses > 0 || s.ef < EF0 || s.q === 1 || s.q === 3); }

  // Anki's three numbers. New is what today's limit still lets in.
  function counts(cards, states, now, newLeft) {
    var c = { neu: 0, learn: 0, due: 0 };
    cards.forEach(function (k) {
      var s = states[k.id];
      if (!s || s.q === 0) c.neu++;
      else if (s.q === 1 || s.q === 3) c.learn++;
      else if (s.due <= now) c.due++;
    });
    c.neu = Math.min(c.neu, Math.max(0, newLeft));
    return c;
  }

  // Next card to show, or null. Learning cards that are due come first, then
  // reviews, then new cards within the day's limit. opts: { newLeft, weak,
  // shuffle, rand, skip } — skip is the id just shown, so it doesn't repeat.
  function next(cards, states, now, opts) {
    opts = opts || {};
    var rand = opts.rand || Math.random;
    var pool = function (f) { return cards.filter(function (k) { return k.id !== opts.skip && f(states[k.id]); }); };
    var pick = function (list, byDue) {
      if (!list.length) return null;
      if (opts.shuffle) return list[Math.floor(rand() * list.length)];
      return byDue ? list.slice().sort(function (a, b) { return states[a.id].due - states[b.id].due; })[0] : list[0];
    };
    if (opts.weak) {
      var w = pool(isWeak).sort(function (a, b) { return states[a.id].ef - states[b.id].ef; });
      return opts.shuffle ? pick(w) : w[0] || null;
    }
    return pick(pool(function (s) { return s && (s.q === 1 || s.q === 3) && s.due <= now; }), true) ||
           pick(pool(function (s) { return s && s.q === 2 && s.due <= now; }), true) ||
           (opts.newLeft > 0 ? pick(pool(function (s) { return !s || s.q === 0; })) : null);
  }

  // Earliest future due time among learning cards (to show "next in …").
  function nextLearnDue(cards, states, now) {
    var t = Infinity;
    cards.forEach(function (k) { var s = states[k.id]; if (s && (s.q === 1 || s.q === 3) && s.due > now) t = Math.min(t, s.due); });
    return t === Infinity ? null : t;
  }

  // ---------- storage blob ----------
  // { uid, t, n, cards: {id: state}, log: {day: done}, news: {day: newSeen}, prefs }
  function merge(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    var out = Object.assign({}, a, b.t > a.t ? b : {});
    out.cards = Object.assign({}, a.cards);
    Object.keys(b.cards || {}).forEach(function (id) {
      var x = out.cards[id], y = b.cards[id];
      if (!x || (y.u || 0) > (x.u || 0)) out.cards[id] = y;
    });
    ['log', 'news'].forEach(function (k) {
      out[k] = Object.assign({}, a[k]);
      Object.keys(b[k] || {}).forEach(function (d) { out[k][d] = Math.max(out[k][d] || 0, b[k][d]); });
    });
    out.t = Math.max(a.t || 0, b.t || 0);
    return out;
  }

  // Only a blob saved by this user counts as theirs.
  function forUser(blob, uid) { return blob && blob.uid === uid ? blob : null; }

  function streak(log, now) {
    var n = 0, t = now;
    if (!(log && log[dayKey(t)])) t -= DAY;   // today not started yet doesn't break it
    while (log && log[dayKey(t)]) { n++; t -= DAY; }
    return n;
  }

  // The three counts from a saved blob alone (subject page: no deck fetch).
  function summary(blob, now) {
    var c = { neu: 0, learn: 0, due: 0 };
    if (!blob) return c;
    var seen = 0;
    Object.keys(blob.cards || {}).forEach(function (id) {
      var s = blob.cards[id];
      if (!s || s.q === 0) return;
      seen++;
      if (s.q === 1 || s.q === 3) c.learn++;
      else if (s.due <= now) c.due++;
    });
    var left = ((blob.prefs && blob.prefs.newPerDay) || 10) - ((blob.news && blob.news[dayKey(now)]) || 0);
    c.neu = Math.max(0, Math.min(left, (blob.n || 0) - seen));
    return c;
  }

  var api = {
    summary: summary,
    buildDeck: buildDeck, schedule: schedule, preview: preview, fmt: fmt,
    counts: counts, next: next, nextLearnDue: nextLearnDue, isWeak: isWeak,
    merge: merge, forUser: forUser, dayKey: dayKey, streak: streak, fresh: fresh,
    MIN: MIN, DAY: DAY
  };
  root.LEASrs = api;
})(typeof window !== 'undefined' ? window : globalThis);

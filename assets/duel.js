/*
 * Duel helpers — the parts with rules in them, kept away from the DOM and
 * away from Supabase so tools/test-duel.mjs can check them.
 *
 * A duel is one row (see design_handoff_lea_reviewer/duels-setup.sql): two
 * people, ten question references, and a score per side written once. Both
 * answer the same ten whenever they like; the result appears when the
 * second score lands.
 */
(function (root) {
  'use strict';

  var SIZE = 10;
  var EXPIRY_DAYS = 3;

  /**
   * Ten question references drawn at random from one subject's index.
   * `pick` is passed in so the test can be deterministic; it defaults to
   * Math.random.
   */
  function drawQuestions(cells, size, pick) {
    var rnd = pick || Math.random;
    var left = (cells || []).slice();
    var out = [];
    var want = Math.min(size || SIZE, left.length);
    while (out.length < want) {
      var i = Math.floor(rnd() * left.length);
      var cell = left.splice(i, 1)[0];
      out.push({ s: cell.subjectId, m: cell.moduleId, i: cell.qIndex });
    }
    return out;
  }

  /** Which side of this duel `meId` is, or null when it is not their duel. */
  function side(duel, meId) {
    if (!duel) return null;
    if (duel.challenger === meId) return 'challenger';
    if (duel.opponent === meId) return 'opponent';
    return null;
  }

  function scoreOf(duel, which) {
    return which === 'challenger' ? duel.challenger_score : duel.opponent_score;
  }

  /**
   * What this duel is waiting for, from `meId`'s point of view:
   *   invited   - they challenged you and you have not answered
   *   declined  - you or they said no
   *   expired   - nobody answered the invitation within three days
   *   your-turn - you have not played your ten yet
   *   waiting   - you have played, they have not
   *   done      - both scores are in
   */
  function phase(duel, meId, now) {
    var me = side(duel, meId);
    if (!me) return null;
    var them = me === 'challenger' ? 'opponent' : 'challenger';
    if (duel.status === 'declined') return 'declined';
    if (scoreOf(duel, me) != null && scoreOf(duel, them) != null) return 'done';
    if (duel.status === 'pending') {
      var age = (now ? new Date(now) : new Date()) - new Date(duel.created_at);
      if (age > EXPIRY_DAYS * 86400000) return 'expired';
      if (me === 'opponent') return 'invited';
    }
    return scoreOf(duel, me) == null ? 'your-turn' : 'waiting';
  }

  /** 'win' | 'loss' | 'draw' for `meId`, or null before both scores are in. */
  function outcome(duel, meId) {
    if (phase(duel, meId) !== 'done') return null;
    var me = side(duel, meId);
    var mine = scoreOf(duel, me);
    var theirs = scoreOf(duel, me === 'challenger' ? 'opponent' : 'challenger');
    return mine === theirs ? 'draw' : (mine > theirs ? 'win' : 'loss');
  }

  /** Wins, losses and draws against one person, finished duels only. */
  function record(duels, meId, themId) {
    var tally = { w: 0, l: 0, d: 0 };
    (duels || []).forEach(function (duel) {
      var other = duel.challenger === meId ? duel.opponent : duel.challenger;
      if (other !== themId) return;
      var result = outcome(duel, meId);
      if (result === 'win') tally.w++;
      else if (result === 'loss') tally.l++;
      else if (result === 'draw') tally.d++;
    });
    return tally;
  }

  /** Newest first, with anything needing your attention lifted to the top. */
  function sortForList(duels, meId, now) {
    var weight = { 'invited': 0, 'your-turn': 1, 'done': 2, 'waiting': 3, 'declined': 4, 'expired': 5 };
    return (duels || []).slice().sort(function (a, b) {
      var wa = weight[phase(a, meId, now)], wb = weight[phase(b, meId, now)];
      if (wa !== wb) return wa - wb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  /**
   * Who a waiting player should be paired with: anyone else in the queue,
   * oldest wait first, so the person who has been waiting longest is taken
   * rather than whoever the channel happens to list first.
   *
   * `queue` is [{ userId, since }]. Returns null when nobody else is there.
   */
  function pickOpponent(queue, meId) {
    var others = (queue || []).filter(function (p) { return p && p.userId && p.userId !== meId; });
    if (!others.length) return null;
    return others.slice().sort(function (a, b) {
      return new Date(a.since || 0) - new Date(b.since || 0);
    })[0].userId;
  }

  root.LEADuel = {
    pickOpponent: pickOpponent,
    SIZE: SIZE,
    EXPIRY_DAYS: EXPIRY_DAYS,
    drawQuestions: drawQuestions,
    side: side,
    scoreOf: scoreOf,
    phase: phase,
    outcome: outcome,
    record: record,
    sortForList: sortForList
  };
})(typeof window !== 'undefined' ? window : globalThis);

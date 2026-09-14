/* LEALeaderboard — one leaderboard row, drawn the same everywhere.
 *
 * WHY THIS EXISTS
 * ---------------
 * The standings page and the subject page's leaderboard modal each drew their
 * own rows. The subject one had drifted into something much plainer: no faces,
 * no online dots, no podium for the top three, and no truncation, so a long
 * name ran straight into the stats beside it ("Al Joshua Calamba325 mastered").
 *
 * The markup lives here and the styling in assets/leaderboard.css, so the two
 * lists cannot diverge again.
 *
 * The stats line is the caller's, because it is the one thing that genuinely
 * differs: the overall board counts mastered questions and average score, the
 * weekly board counts a week's mastery.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** username -> avatar_url, for everyone who has set one. */
  function loadAvatars(sb) {
    return sb.from('profiles').select('username, avatar_url').then(function (res) {
      var map = {};
      if (res && res.data) {
        res.data.forEach(function (r) { if (r.username && r.avatar_url) map[r.username] = r.avatar_url; });
      }
      return map;
    }).catch(function () { return {}; });
  }

  /**
   * Marked only where it is known to be true: LEAPresence reports who is on
   * the channel right now, and anyone absent simply gets no dot rather than an
   * "offline" claim we cannot make about someone who may just be on a page
   * that has not connected yet.
   */
  function onlineDot(username) {
    return (window.LEAPresence && window.LEAPresence.isOnline(username))
      ? '<span class="lb-live" title="Online now"></span>'
      : '';
  }

  // avatar.js owns initials and the img-vs-initials decision. Falling back
  // rather than requiring it keeps this usable on a page that has not loaded
  // it, at the cost of the face being blank there.
  function faceHtml(url, username) {
    if (window.LEAAvatar && window.LEAAvatar.faceHtml) return window.LEAAvatar.faceHtml(url, username);
    return escapeHtml(String(username || '?').trim().charAt(0).toUpperCase());
  }

  /**
   * One row.
   *   row     { username, ... }
   *   rank    1-based; 1-3 get the podium treatment
   *   opts    { stats, isMine, avatars }
   */
  function rowHtml(row, rank, opts) {
    opts = opts || {};
    var cls = 'lb-row' + (rank <= 3 ? ' top' + rank : '') + (opts.isMine ? ' mine' : '');
    var avatars = opts.avatars || {};
    // Standings' "floors": the count sits beside the name and a bar sized
    // against first place runs underneath. opts.bar = { value, pct, markPct?, note? }
    if (opts.bar) {
      var b = opts.bar, clamp = function (n) { return Math.max(2, Math.min(100, Math.round(n))); };
      return '<div class="' + cls + ' has-bar">' +
        '<div class="lb-rank">' + rank + '</div>' +
        '<div class="lb-face">' + faceHtml(avatars[row.username], row.username) + '</div>' +
        '<div class="lb-main">' +
          '<div class="lb-line"><div class="lb-name"><span class="who">' + escapeHtml(row.username) +
            (opts.isMine ? ' (you)' : '') + '</span>' + onlineDot(row.username) + '</div>' +
            '<span class="lb-val">' + valueText(b.value) + '</span></div>' +
          '<div class="lb-bar"><i style="width:' + clamp(b.pct) + '%"></i>' +
            (b.markPct != null ? '<span class="lb-mark" style="left:' + clamp(b.markPct) + '%"></span>' : '') + '</div>' +
          (b.note ? '<div class="lb-note">' + escapeHtml(b.note) + '</div>' : '') +
        '</div>' +
      '</div>';
    }
    return '<div class="' + cls + '">' +
      '<div class="lb-rank">' + rank + '</div>' +
      '<div class="lb-face">' + faceHtml(avatars[row.username], row.username) + '</div>' +
      '<div class="lb-name"><span class="who">' + escapeHtml(row.username) +
        (opts.isMine ? ' (you)' : '') + '</span>' + onlineDot(row.username) + '</div>' +
      // "2301 mastered · 82% avg" stacks one part per line, so the stats stay
      // narrow and the name beside them is not cut short.
      '<div class="lb-stats">' + String(opts.stats || '').split(' · ').map(function (part) {
        return '<span>' + escapeHtml(part) + '</span>';
      }).join('') + '</div>' +
    '</div>';
  }

  /**
   * A whole list.
   *   opts { myUsername, avatars, stats(row) -> string, empty }
   */
  function listHtml(rows, opts) {
    opts = opts || {};
    if (!rows || rows.length === 0) {
      return '<div class="lb-empty">' + escapeHtml(opts.empty || 'No scores yet — be the first!') + '</div>';
    }
    var stats = opts.stats || function () { return ''; };
    var html = headHtml(opts.head || 'Mastered · Avg') + rows.map(function (row, i) {
      return rowHtml(row, i + 1, {
        stats: stats(row),
        isMine: opts.myUsername != null && row.username === opts.myUsername,
        avatars: opts.avatars
      });
    }).join('');
    return '<div class="lb-list">' + html + '</div>';
  }

  /** The overall board's stats: mastered count over average best score. The
   *  words live once in the column head (headHtml), not on every row. */
  function overallStats(row) {
    return (row.total_mastered || 0) + ' · ' + Math.round((row.avg_best_score || 0) * 100) + '%';
  }

  /** One label row above a list, naming what the right-hand numbers are. */
  function headHtml(statsLabel) {
    return '<div class="lb-head"><span>Rank</span><span>' + escapeHtml(statsLabel) + '</span></div>';
  }

  function valueText(n) { return Number(n || 0).toLocaleString('en-US'); }

  /**
   * The top three on stepped blocks, first place in the middle and tallest.
   *   rows  the whole board, best first
   *   opts  { value(row) -> number, avatars, myUsername }
   */
  function podiumHtml(rows, opts) {
    var avatars = opts.avatars || {};
    return '<div class="lb-podium">' + [1, 0, 2].filter(function (i) { return rows[i]; }).map(function (i) {
      var row = rows[i], rank = i + 1, mine = row.username === opts.myUsername;
      return '<div class="lb-step p' + rank + (mine ? ' mine' : '') + '">' +
        '<div class="lb-face">' + faceHtml(avatars[row.username], row.username) + '</div>' +
        '<div class="lb-pname"><span class="who">' + escapeHtml(row.username) + (mine ? ' (you)' : '') + '</span>' + onlineDot(row.username) + '</div>' +
        '<div class="lb-pval">' + valueText(opts.value(row)) + '</div>' +
        '<div class="lb-plinth"><b>' + rank + '</b></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** Marks skipped ranks between the list and a pinned row further down. */
  function gapHtml() {
    return '<div class="lb-gap" aria-hidden="true">⋯</div>';
  }

  window.LEALeaderboard = {
    loadAvatars: loadAvatars,
    onlineDot: onlineDot,
    rowHtml: rowHtml,
    listHtml: listHtml,
    headHtml: headHtml,
    gapHtml: gapHtml,
    podiumHtml: podiumHtml,
    overallStats: overallStats
  };
})();

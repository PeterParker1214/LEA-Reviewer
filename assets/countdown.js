/*
 * LEACountdown — the one clock.
 *
 * Home (2a) and Sign in (2e) both count down to the same exam. They render it
 * differently — Home as four split-flap panels including seconds, Sign in as
 * `d : h : m` with colon separators — but they must never disagree. Two
 * independent timers drifting a second apart would be worse than one that is
 * slightly wrong, so the date and the arithmetic live here and each screen
 * draws its own markup from the same numbers.
 *
 * Usage:
 *   LEACountdown.parts()            -> { days, hrs, mins, secs, diff }
 *   LEACountdown.label              -> "17 January 2027"
 *   const stop = LEACountdown.subscribe(p => { ...paint... });
 *
 * subscribe() fires immediately and then once a second, and returns a
 * function that stops it. Callers that re-render should call that function
 * before subscribing again, or they will stack timers.
 */
window.LEACountdown = (function () {
  // Philippine time: the exam sits on a date, not a moment in the reader's
  // zone, so the offset is pinned rather than left to the local clock.
  var EXAM_DATE = new Date('2027-01-17T00:00:00+08:00');
  var LABEL = '17 January 2027';

  function parts() {
    var diff = Math.max(0, EXAM_DATE.getTime() - Date.now());
    var totalSec = Math.floor(diff / 1000);
    return {
      diff: diff,
      days: Math.floor(totalSec / 86400),
      hrs: Math.floor((totalSec % 86400) / 3600),
      mins: Math.floor((totalSec % 3600) / 60),
      secs: totalSec % 60
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    fn(parts());
    var id = setInterval(function () { fn(parts()); }, 1000);
    return function () { clearInterval(id); };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  return {
    EXAM_DATE: EXAM_DATE,
    label: LABEL,
    parts: parts,
    subscribe: subscribe,
    pad2: pad2
  };
})();

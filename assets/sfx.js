/* LEA Reviewer — shared sound effects.
   Synthesized with the Web Audio API (no audio files to load), so it works
   instantly on every page. One localStorage key ('leaSfxMuted') is shared
   across the site, same pattern as theme.js. */
(function () {
  var KEY = 'leaSfxMuted';
  var ctx = null;
  var muted = false;

  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Play one tone. time is an offset (seconds) from "now".
  function tone(freq, time, dur, opts) {
    opts = opts || {};
    var c = ensureCtx();
    if (!c || muted) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.value = freq;
    var start = c.currentTime + time;
    var peak = opts.peak != null ? opts.peak : 0.15;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    if (opts.glideTo) {
      osc.frequency.exponentialRampToValueAtTime(opts.glideTo, start + dur);
    }
  }

  function playCorrect() {
    tone(587.33, 0, 0.11, { type: 'sine', peak: 0.16 });   // D5
    tone(880.00, 0.09, 0.16, { type: 'sine', peak: 0.16 }); // A5
  }

  function playIncorrect() {
    tone(196.00, 0, 0.22, { type: 'sine', peak: 0.14, glideTo: 146.83 }); // G3 -> D3
  }

  function playComplete() {
    tone(523.25, 0.00, 0.13, { type: 'sine', peak: 0.15 }); // C5
    tone(659.25, 0.12, 0.13, { type: 'sine', peak: 0.15 }); // E5
    tone(783.99, 0.24, 0.13, { type: 'sine', peak: 0.15 }); // G5
    tone(1046.50, 0.36, 0.22, { type: 'sine', peak: 0.17 }); // C6
  }

  function playClick() {
    tone(740, 0, 0.05, { type: 'sine', peak: 0.06 });
  }

  function setMuted(next) {
    muted = next;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
  }

  // opts: { buttonId }
  function init(opts) {
    opts = opts || {};
    var btn = opts.buttonId ? document.getElementById(opts.buttonId) : null;
    if (!btn) return { get: function () { return muted; } };

    function paint() {
      btn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; // 🔇 : 🔊
      btn.setAttribute('aria-label', muted ? 'Unmute sound effects' : 'Mute sound effects');
    }
    paint();

    btn.addEventListener('click', function () {
      setMuted(!muted);
      ensureCtx();
      paint();
      if (!muted) playClick();
    });

    return { get: function () { return muted; } };
  }

  window.LEASfx = {
    init: init,
    playCorrect: playCorrect,
    playIncorrect: playIncorrect,
    playComplete: playComplete,
    playClick: playClick
  };
})();

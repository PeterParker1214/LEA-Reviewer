/* LEA Reviewer — lightweight audio engine.
 *
 * No external audio library is required. Short UI sounds are synthesized with
 * Web Audio, and the optional background loop is generated from a small set of
 * tones. This keeps the first implementation copyright/licensing-neutral and
 * makes the feature usable offline/PWA-style.
 *
 * Public API:
 *   LEAAudio.init();
 *   LEAAudio.unlock();
 *   LEAAudio.playSfx('click'|'correct'|'wrong'|'countdown'|'complete'|'tick'|'navigate');
 *   LEAAudio.startBgm(); LEAAudio.stopBgm();
 *   LEAAudio.toggleMute();
 *   LEAAudio.setMusicVolume(0..1); LEAAudio.setSfxVolume(0..1);
 *   LEAAudio.getSettings();
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'lea_audio_settings_v1';
  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var bgmTimer = null;
  var bgmStep = 0;
  var unlocked = false;

  var settings = {
    music: 0.18,
    sfx: 0.55,
    muted: false
  };

  function clamp(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        if (saved.music != null) settings.music = clamp(saved.music, 0, 1);
        if (saved.sfx != null) settings.sfx = clamp(saved.sfx, 0, 1);
        settings.muted = !!saved.muted;
      }
    } catch (e) {}
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function ensureContext() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      applyGains();
    }
    return ctx;
  }

  function applyGains() {
    if (!ctx || !masterGain) return;
    var now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.02);
    musicGain.gain.setTargetAtTime(settings.music, now, 0.02);
    sfxGain.gain.setTargetAtTime(settings.sfx, now, 0.01);
  }

  function unlock() {
    var audio = ensureContext();
    if (!audio) return false;
    unlocked = true;
    if (audio.state === 'suspended') audio.resume().catch(function () {});
    return true;
  }

  function tone(freq, duration, type, volume, destination, attack, release, when) {
    var audio = ensureContext();
    if (!audio || settings.muted) return;
    when = when == null ? audio.currentTime : when;
    attack = attack == null ? 0.008 : attack;
    release = release == null ? Math.min(0.08, duration * 0.35) : release;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), when + attack);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), Math.max(when + attack, when + duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(destination || sfxGain);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  function chord(notes, duration, when) {
    notes.forEach(function (n, i) {
      tone(n, duration, i % 2 ? 'triangle' : 'sine', 0.055, musicGain, 0.03, 0.18, when);
    });
  }

  function playSfx(name) {
    if (!unlocked && !unlock()) return;
    var audio = ensureContext();
    if (!audio || settings.muted) return;
    var t = audio.currentTime;

    switch (name) {
      case 'click':
        tone(620, 0.045, 'square', 0.055, sfxGain, 0.003, 0.025, t);
        break;
      case 'correct':
        tone(660, 0.08, 'triangle', 0.10, sfxGain, 0.006, 0.03, t);
        tone(880, 0.14, 'triangle', 0.11, sfxGain, 0.006, 0.05, t + 0.07);
        tone(1320, 0.17, 'sine', 0.06, sfxGain, 0.006, 0.08, t + 0.15);
        break;
      case 'wrong':
        tone(220, 0.14, 'sawtooth', 0.075, sfxGain, 0.005, 0.06, t);
        tone(175, 0.18, 'triangle', 0.055, sfxGain, 0.005, 0.08, t + 0.07);
        break;
      case 'countdown':
        tone(740, 0.09, 'square', 0.065, sfxGain, 0.003, 0.04, t);
        break;
      case 'tick':
        tone(980, 0.035, 'square', 0.04, sfxGain, 0.002, 0.018, t);
        break;
      case 'navigate':
        tone(520, 0.055, 'sine', 0.045, sfxGain, 0.004, 0.025, t);
        tone(690, 0.06, 'sine', 0.035, sfxGain, 0.004, 0.028, t + 0.045);
        break;
      case 'complete':
        tone(523.25, 0.11, 'triangle', 0.08, sfxGain, 0.008, 0.04, t);
        tone(659.25, 0.11, 'triangle', 0.08, sfxGain, 0.008, 0.04, t + 0.08);
        tone(783.99, 0.14, 'triangle', 0.09, sfxGain, 0.008, 0.05, t + 0.16);
        tone(1046.5, 0.28, 'sine', 0.07, sfxGain, 0.008, 0.12, t + 0.26);
        break;
    }
  }

  /* A restrained 8-step study loop: soft bass + suspended dyads.
   * It intentionally stays well below speech/UI volume. */
  function scheduleBgmStep() {
    var audio = ensureContext();
    if (!audio || settings.muted || settings.music <= 0) return;
    var now = audio.currentTime;
    var roots = [220, 196, 174.61, 196, 220, 261.63, 233.08, 196];
    var root = roots[bgmStep % roots.length];
    chord([root, root * 1.5], 0.62, now);
    tone(root / 2, 0.52, 'sine', 0.045, musicGain, 0.02, 0.16, now);
    if (bgmStep % 2 === 0) tone(root * 2, 0.24, 'triangle', 0.025, musicGain, 0.02, 0.08, now + 0.18);
    bgmStep++;
  }

  function startBgm() {
    unlock();
    if (bgmTimer) return;
    scheduleBgmStep();
    bgmTimer = setInterval(scheduleBgmStep, 640);
  }

  function stopBgm() {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
  }

  function setMusicVolume(v) {
    settings.music = clamp(v, 0, 1);
    saveSettings();
    applyGains();
  }

  function setSfxVolume(v) {
    settings.sfx = clamp(v, 0, 1);
    saveSettings();
    applyGains();
  }

  function toggleMute() {
    settings.muted = !settings.muted;
    saveSettings();
    applyGains();
    return settings.muted;
  }

  function init() {
    loadSettings();
    return ensureContext();
  }

  window.LEAAudio = {
    init: init,
    unlock: unlock,
    playSfx: playSfx,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setMusicVolume: setMusicVolume,
    setSfxVolume: setSfxVolume,
    toggleMute: toggleMute,
    getSettings: function () {
      return { music: settings.music, sfx: settings.sfx, muted: settings.muted };
    }
  };
})();

/* LEA Reviewer — approved SFX engine.
 * Real Mixkit assets only. Background music is intentionally parked for now.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'lea_audio_settings_v2';
  var settings = { sfx: 0.70, muted: false };
  var audio = {};
  var POOL_SIZE = 6;
  var unlocked = false;
  var SOURCES = {
    click: 'https://assets.mixkit.co/active_storage/sfx/3124/3124-preview.mp3',
    wrong: 'https://assets.mixkit.co/active_storage/sfx/2256/2256.wav',
    correct: 'https://assets.mixkit.co/active_storage/sfx/600/600.wav',
    next: 'https://assets.mixkit.co/active_storage/sfx/217/217-preview.mp3',
    complete: 'https://assets.mixkit.co/active_storage/sfx/938/938.wav'
  };
  function clamp(v){v=Number(v);return isFinite(v)?Math.max(0,Math.min(1,v)):0}
  function loadSettings(){try{var raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;var saved=JSON.parse(raw);if(!saved||typeof saved!=='object')return;if(saved.sfx!=null)settings.sfx=clamp(saved.sfx);settings.muted=!!saved.muted}catch(e){}}
  function saveSettings(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch(e){}}
  function buildAudio(){
    Object.keys(SOURCES).forEach(function(name){
      var pool = [];
      for(var i=0;i<POOL_SIZE;i++){
        var el = new Audio();
        el.preload = 'auto';
        el.src = SOURCES[name];
        el.volume = settings.sfx;
        pool.push(el);
      }
      audio[name] = { pool: pool, cursor: 0 };
    });
  }
  function applyVolume(){
    Object.keys(audio).forEach(function(name){
      audio[name].pool.forEach(function(el){ el.volume = settings.sfx; });
    });
  }
  function unlock(){unlocked=true;applyVolume();return true}
  function playSfx(name){
    if(!unlocked) unlock();
    if(settings.muted) return false;
    var entry = audio[name];
    if(!entry) return false;
    try{
      // Advance through several ready clips so rapid clicks overlap instead
      // of cutting off the sound that just started.
      var clip = null;
      for(var i=0;i<entry.pool.length;i++){
        var idx = (entry.cursor + i) % entry.pool.length;
        var candidate = entry.pool[idx];
        if(candidate.paused || candidate.ended){ clip = candidate; entry.cursor = (idx + 1) % entry.pool.length; break; }
      }
      // All clips are busy: create one extra just for this burst. It is not
      // stored, so the pool stays small during normal use.
      if(!clip){
        clip = new Audio(SOURCES[name]);
        clip.preload = 'auto';
      }
      clip.volume = settings.sfx;
      if(clip.paused || clip.ended) clip.currentTime = 0;
      var p = clip.play();
      if(p && p.catch) p.catch(function(){});
      return true;
    }catch(e){ return false; }
  }
  function setSfxVolume(v){settings.sfx=clamp(v);saveSettings();applyVolume()}
  function toggleMute(){settings.muted=!settings.muted;saveSettings();return settings.muted}
  function init(){loadSettings();buildAudio();return true}
  window.LEAAudio={init:init,unlock:unlock,playSfx:playSfx,setSfxVolume:setSfxVolume,toggleMute:toggleMute,getSettings:function(){return{sfx:settings.sfx,muted:settings.muted,sources:SOURCES}}}
  // Initialize immediately so quiz handlers can play SFX on their first click.
  init();
})();
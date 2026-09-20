/* LEA Reviewer — approved SFX engine.
 * Real Mixkit assets only. Background music is intentionally parked for now.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'lea_audio_settings_v2';
  var settings = { sfx: 0.70, muted: false };
  var audio = {};
  var unlocked = false;
  var SOURCES = {
    wrong: 'https://assets.mixkit.co/active_storage/sfx/2256/2256.wav',
    correct: 'https://assets.mixkit.co/active_storage/sfx/600/600.wav',
    next: 'https://assets.mixkit.co/active_storage/sfx/217/217-preview.mp3',
    complete: 'https://assets.mixkit.co/active_storage/sfx/938/938.wav'
  };
  function clamp(v){v=Number(v);return isFinite(v)?Math.max(0,Math.min(1,v)):0}
  function loadSettings(){try{var raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;var saved=JSON.parse(raw);if(!saved||typeof saved!=='object')return;if(saved.sfx!=null)settings.sfx=clamp(saved.sfx);settings.muted=!!saved.muted}catch(e){}}
  function saveSettings(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch(e){}}
  function buildAudio(){Object.keys(SOURCES).forEach(function(name){var el=new Audio();el.preload='auto';el.src=SOURCES[name];el.volume=settings.sfx;audio[name]=el})}
  function applyVolume(){Object.keys(audio).forEach(function(name){audio[name].volume=settings.sfx})}
  function unlock(){unlocked=true;applyVolume();return true}
  function playSfx(name){if(!unlocked)unlock();if(settings.muted)return false;var clip=audio[name];if(!clip)return false;try{clip.pause();clip.currentTime=0;clip.volume=settings.sfx;var p=clip.play();if(p&&p.catch)p.catch(function(){});return true}catch(e){return false}}
  function setSfxVolume(v){settings.sfx=clamp(v);saveSettings();applyVolume()}
  function toggleMute(){settings.muted=!settings.muted;saveSettings();return settings.muted}
  function init(){loadSettings();buildAudio();return true}
  window.LEAAudio={init:init,unlock:unlock,playSfx:playSfx,setSfxVolume:setSfxVolume,toggleMute:toggleMute,getSettings:function(){return{sfx:settings.sfx,muted:settings.muted,sources:SOURCES}}}
  // Initialize immediately so quiz handlers can play SFX on their first click.
  init();
})();
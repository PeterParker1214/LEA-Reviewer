// The speaker button on a question card reads the stem aloud, and a second
// click stops it. Both the button markup and the click handler live in
// run.html, so this pulls them out of the real file rather than restating
// them, drives them against a fake speechSynthesis, and checks what was
// spoken and when it stopped.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync('run.html', 'utf8');
const speakBtn = src.match(/function speakBtnHtml\(\)\{[\s\S]*?\n\}/);
const bestVoice = src.match(/function bestVoice\(\)\{[\s\S]*?\n\}/);
const handler = src.match(/document\.addEventListener\('click', \(e\) => \{[\s\S]*?\n\}\);/);
assert.ok(speakBtn && bestVoice && handler, 'run.html no longer holds the speak button code');

const dom = new JSDOM('<div id="cardSlot"></div>');
const spoken = [];
let speaking = false;
const synth = {
  get speaking(){ return speaking; },
  getVoices: () => [
    { name: 'Microsoft David Desktop', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
  ],
  speak: (u) => { speaking = true; spoken.push(u); },
  cancel: () => { speaking = false; },
};
dom.window.speechSynthesis = synth;
dom.window.SpeechSynthesisUtterance = function(text){ this.text = text; };

const ctx = vm.createContext(dom.window);
vm.runInContext([speakBtn[0], bestVoice[0], handler[0]].join('\n'), ctx);

const stem = 'What is the minimum width of an exit corridor?';
dom.window.document.getElementById('cardSlot').innerHTML =
  '<div class="q-body"><p class="qtext">' + stem + vm.runInContext('speakBtnHtml()', ctx) + '</p></div>';

const btn = dom.window.document.querySelector('.speak-btn');
assert.ok(btn, 'no speaker button rendered');
assert.strictEqual(btn.getAttribute('aria-label'), 'Read question aloud');

btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert.strictEqual(spoken.length, 1, 'first click did not speak');
assert.strictEqual(spoken[0].text, stem, 'spoke something other than the question stem');
assert.strictEqual(spoken[0].voice.name, 'Microsoft Aria Online (Natural)', 'did not pick the natural voice');
assert.ok(btn.classList.contains('active'), 'button does not show it is speaking');

btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert.strictEqual(speaking, false, 'second click did not stop the speech');
assert.strictEqual(spoken.length, 1, 'second click started a second reading');
assert.ok(!btn.classList.contains('active'), 'button still shows it is speaking');

console.log('quiz-speak: ok');

/*
 * LEAQuizPop: the pop-up quiz. One random question from the whole bank, in a
 * card over the page.
 *
 *   open(opts)          show a card. opts.item shows a given question,
 *                       opts.guest is the sign-in screen tease (opts.onSignIn)
 *   pick(rand)          a random question { s, m, qi, q }. Modules are weighted
 *                       by size, so every question in the bank is equally likely
 *   get(sid, mid, qi)   one given question (the notification's link)
 *   slot(freq, now)     the latest notification slot for a frequency
 *   forSlot(id)         that slot's question: the same for everyone, all hour
 *   startHome(isHome)   once per visit, then each new slot while Home is open
 *   startSignIn(fn)     once per visit on the sign-in screen
 *
 * Sounds come from LEAAudio (assets/audio.js), so the reader's volume and mute
 * apply: 'next' as a card arrives, 'correct' or 'wrong' on an answer, and
 * 'complete' when the answer is a new mastery. Browsers stay silent until the
 * reader has tapped the page once, so a card that opens on page load is quiet.
 *
 * A right answer goes through LEAProgress.markMastered, the same call the
 * reviewer makes, so it counts on Home and on the leaderboard. On the sign-in
 * screen it is queued on the device and saved once the reader signs in.
 *
 * How often: the "Pop-up quiz" reminder (assets/reminders.js) holds the switch
 * and the frequency. Turning it off stops the Home pop-up and the notifications.
 */
(function(){
  'use strict';
  const FREQS = { hourly:null, morning:8, lunch:12, afternoon:15, evening:19 };
  const VISIT_KEY = 'lea_quizpop_visit', TEASE_KEY = 'lea_quizpop_tease';
  const SLOT_KEY = 'lea_quizpop_slot', TOASTED_KEY = 'lea_notify_toasted';
  let subjectsP = null, current = null, timer = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const plain = s => String(s || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{200D}\u{FE0F}]+/gu, '').trim();
  const pad = n => String(n).padStart(2, '0');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sfx = name => { try{ if(window.LEAAudio) LEAAudio.playSfx(name); }catch(e){} };
  const day = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function subjects(){
    if(!subjectsP){
      subjectsP = fetch('data/subjects.json').then(r => r.json())
        .then(s => (Array.isArray(s) ? s : []).filter(x => x.ready && (x.modules || []).length))
        .catch(() => { subjectsP = null; return []; });
    }
    return subjectsP;
  }

  // Same seed, same sequence: a slot's question is the same on every device.
  function seeded(str){
    let a = 2166136261;
    for(let i = 0; i < str.length; i++){ a ^= str.charCodeAt(i); a = Math.imul(a, 16777619); }
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  async function pick(rand){
    rand = rand || Math.random;
    const mods = []; let total = 0;
    (await subjects()).forEach(s => s.modules.forEach(m => {
      if(m.total > 0){ total += m.total; mods.push({ s, m, end: total }); }
    }));
    // A module that fails to load is skipped, not fatal.
    for(let tries = 0; tries < 4 && total; tries++){
      const r = rand() * total;
      const hit = mods.find(x => r < x.end) || mods[mods.length - 1];
      const qs = await LEAQuizSource.loadModuleQuestions(hit.m);
      const live = (qs || []).map((q, i) => ({ q, i })).filter(x => x.q && !x.q.hidden && Array.isArray(x.q.o) && x.q.o.length);
      if(live.length){
        const x = live[Math.floor(rand() * live.length)];
        return { s: hit.s, m: hit.m, qi: x.i, q: x.q };
      }
    }
    return null;
  }

  async function get(sid, mid, qi){
    const s = (await subjects()).find(x => x.id === sid);
    const m = s && s.modules.find(x => x.id === mid);
    if(!m) return null;
    const qs = await LEAQuizSource.loadModuleQuestions(m);
    const q = qs && qs[qi];
    return q && !q.hidden && Array.isArray(q.o) ? { s, m, qi, q } : null;
  }

  function slot(freq, now){
    const d = new Date(now || Date.now());
    const h = FREQS[freq];
    if(h == null){ d.setMinutes(0, 0, 0); return { id: day(d) + 'T' + pad(d.getHours()), at: d }; }
    if(d.getHours() < h) d.setDate(d.getDate() - 1);
    d.setHours(h, 0, 0, 0);
    return { id: day(d) + '-' + freq, at: d };
  }
  const forSlot = id => pick(seeded('quiz:' + id));

  function prefs(){
    const p = window.LEAReminders ? LEAReminders.prefs() : {};
    return { on: p.quiz !== false, freq: p.quizFreq in FREQS ? p.quizFreq : 'hourly' };
  }

  // This slot's pop-up has been shown, so its notification need not pop up too.
  function markSlot(id){
    try{
      localStorage.setItem(SLOT_KEY, id);
      const done = JSON.parse(localStorage.getItem(TOASTED_KEY) || '[]');
      const key = 'reminder:quiz:' + id;
      if(done.indexOf(key) === -1) localStorage.setItem(TOASTED_KEY, JSON.stringify(done.concat(key).slice(-300)));
    }catch(e){}
  }

  function firstThisVisit(key){
    try{ if(sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); }catch(e){}
    return true;
  }

  // ?qs=&qm=&qi= from a notification. Read once, then dropped from the address.
  function takeLink(){
    const p = new URLSearchParams(location.search);
    if(!p.has('qs') || !/^\d+$/.test(p.get('qi') || '')) return null;
    const link = { s: p.get('qs'), m: p.get('qm'), qi: Number(p.get('qi')) };
    ['qs', 'qm', 'qi'].forEach(k => p.delete(k));
    try{ history.replaceState(history.state, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash); }catch(e){}
    return link;
  }

  const isMastered = it => !!(window.LEAProgress && (LEAProgress.load(it.s.id, it.m.id).mastered || []).indexOf(it.qi) !== -1);

  // ---------------------------------------------------------------- the card
  function css(){
    if(document.getElementById('qp-css')) return;
    const st = document.createElement('style');
    st.id = 'qp-css';
    st.textContent = `
.qp-overlay{position:fixed;inset:0;z-index:5200;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,8,12,0);transition:background .35s,backdrop-filter .35s;overscroll-behavior:contain;}
.qp-overlay.in{background:rgba(4,8,12,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}
.qp-overlay.out{background:rgba(4,8,12,0);backdrop-filter:none;}
.qp-card{position:relative;width:min(460px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:var(--bg-panel,#0e1c28);color:var(--ink,#eef1e9);border:1px solid var(--line,rgba(111,168,207,.2));border-top:3px solid var(--gold,#e0a83f);border-radius:16px;padding:18px 18px 18px;box-shadow:0 24px 60px rgba(0,0,0,.5);font-family:var(--font-body,system-ui,sans-serif);transform:translateY(46px) scale(.84) rotate(-3deg);opacity:0;transition:transform .6s cubic-bezier(.34,1.56,.64,1),opacity .3s;outline:none;}
.qp-overlay.in .qp-card{transform:none;opacity:1;}
.qp-overlay.out .qp-card{transform:translateY(24px) scale(.9) rotate(2deg);opacity:0;transition:transform .28s ease-in,opacity .25s;}
.qp-body.leave{opacity:0;transform:translateX(-26px) rotate(-1deg);transition:opacity .2s,transform .2s ease-in;}
.qp-body.enter{animation:qp-enter .45s cubic-bezier(.34,1.56,.64,1);}
.qp-x{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--muted,#8b98a5);font-size:22px;line-height:1;cursor:pointer;transition:transform .3s,color .2s,background .2s;}
.qp-x:hover{transform:rotate(90deg);color:var(--ink,#eef1e9);background:color-mix(in srgb,var(--ink,#fff) 8%,transparent);}
.qp-head{display:flex;gap:12px;align-items:center;margin:0 34px 14px 0;}
.qp-bubble{flex:none;width:42px;height:42px;border-radius:13px;background:var(--gold,#e0a83f);color:#1a1206;display:grid;place-items:center;font-family:var(--font-display,sans-serif);font-weight:800;font-size:25px;box-shadow:0 4px 0 color-mix(in srgb,var(--gold,#e0a83f) 55%,#000);animation:qp-wiggle 3s ease-in-out .8s infinite;}
.qp-bubble.yay{background:var(--good,#5fbf82);color:#fff;box-shadow:0 4px 0 color-mix(in srgb,var(--good,#5fbf82) 55%,#000);animation:qp-boing .7s cubic-bezier(.34,1.56,.64,1);}
.qp-bubble.oops{background:var(--bad,#e2604a);color:#fff;box-shadow:0 4px 0 color-mix(in srgb,var(--bad,#e2604a) 55%,#000);animation:qp-tilt .55s ease;}
.qp-kicker{font-family:var(--font-mono,monospace);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-bright,#f0c268);}
.qp-where{font-size:12.5px;color:var(--muted,#8b98a5);margin-top:3px;line-height:1.35;}
.qp-scn{font-size:13px;line-height:1.55;background:var(--bg-panel-2,#0a1520);border-left:2px solid var(--blue,#6fa8cf);padding:9px 11px;margin:0 0 12px;border-radius:0 8px 8px 0;white-space:pre-line;}
.qp-scn b{display:block;font-family:var(--font-mono,monospace);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--blue-bright,#8fc4ea);margin-bottom:3px;}
.qp-q{font-size:16px;line-height:1.5;margin:0 0 4px;font-weight:500;white-space:pre-line;}
.qp-pic-btn{display:inline-flex;align-items:center;gap:7px;margin:8px 0 0;padding:7px 12px;border-radius:999px;border:1px dashed var(--gold,#e0a83f);background:transparent;color:var(--gold-bright,#f0c268);font-family:var(--font-mono,monospace);font-size:11.5px;letter-spacing:.04em;cursor:pointer;transition:transform .2s,background .2s;}
.qp-pic-btn:hover{transform:translateY(-1px) rotate(-1deg);background:color-mix(in srgb,var(--gold,#e0a83f) 12%,transparent);}
.qp-pic{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s ease;}
.qp-pic.open{grid-template-rows:1fr;}
.qp-pic > div{overflow:hidden;}
.qp-pic img{display:block;max-width:100%;max-height:45vh;margin:10px auto 2px;border-radius:8px;background:#fff;cursor:zoom-in;transform:scale(.85) rotate(-2deg);opacity:0;transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .3s;}
.qp-pic.open img{transform:none;opacity:1;}
.qp-zoom{position:fixed;inset:0;z-index:5300;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:12px;cursor:zoom-out;animation:qp-fade .2s;}
.qp-zoom img{max-width:100%;max-height:100%;background:#fff;border-radius:6px;animation:qp-enter .35s cubic-bezier(.34,1.56,.64,1);}
.qp-opts{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
.qp-opt{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line,rgba(111,168,207,.2));background:var(--bg-panel-2,#0a1520);color:var(--ink,#eef1e9);font:inherit;font-size:14px;line-height:1.4;cursor:pointer;opacity:0;animation:qp-rise .5s cubic-bezier(.34,1.56,.64,1) var(--d) forwards;transition:transform .18s cubic-bezier(.34,1.56,.64,1),border-color .2s,background .2s,opacity .3s;}
.qp-opt:hover:not(:disabled){transform:translateY(-2px);border-color:var(--gold,#e0a83f);}
.qp-opt:active:not(:disabled){transform:scale(.97);}
.qp-opt:disabled{cursor:default;}
.qp-opt.done{opacity:1;animation:none;}
.qp-letter{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-family:var(--font-mono,monospace);font-size:11.5px;font-weight:600;border:1px solid var(--line,rgba(111,168,207,.2));color:var(--gold-bright,#f0c268);transition:background .25s,color .25s,border-color .25s;}
.qp-opt.right{border-color:var(--good,#5fbf82);background:color-mix(in srgb,var(--good,#5fbf82) 18%,var(--bg-panel-2,#0a1520));animation:qp-pop .55s cubic-bezier(.34,1.56,.64,1);}
.qp-opt.right .qp-letter{background:var(--good,#5fbf82);border-color:var(--good,#5fbf82);color:#fff;}
.qp-opt.wrong{border-color:var(--bad,#e2604a);background:color-mix(in srgb,var(--bad,#e2604a) 16%,var(--bg-panel-2,#0a1520));animation:qp-shake .5s;}
.qp-opt.wrong .qp-letter{background:var(--bad,#e2604a);border-color:var(--bad,#e2604a);color:#fff;}
.qp-opt.dim{opacity:.45;}
.qp-after:not(:empty){animation:qp-rise .5s cubic-bezier(.34,1.56,.64,1) .2s both;}
.qp-verdict{margin:16px 0 8px;font-weight:600;font-size:15px;}
.qp-verdict.ok{color:var(--good,#5fbf82);}
.qp-verdict.no{color:var(--bad,#e2604a);}
.qp-exp{font-size:13.5px;line-height:1.55;border-left:2px solid var(--gold,#e0a83f);padding-left:11px;white-space:pre-line;}
.qp-formula{font-family:var(--font-mono,monospace);font-size:12.5px;color:var(--blue-bright,#8fc4ea);margin-top:6px;}
.qp-steps{margin:6px 0 0;padding-left:18px;}
.qp-ref{margin-top:8px;font-family:var(--font-mono,monospace);font-size:11px;color:var(--muted,#8b98a5);}
.qp-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
.qp-go{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 14px;border-radius:10px;background:var(--gold,#e0a83f);color:#1a1206;font-family:var(--font-mono,monospace);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border:none;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),filter .2s;}
.qp-go:hover{transform:translateY(-2px);filter:brightness(1.08);}
.qp-go .qp-arrow{display:inline-block;transition:transform .25s;}
.qp-go:hover .qp-arrow{transform:translateX(4px);}
.qp-more{display:inline-flex;align-items:center;gap:6px;padding:12px 14px;border-radius:10px;border:1px solid var(--line,rgba(111,168,207,.2));background:transparent;color:var(--ink,#eef1e9);font-family:var(--font-mono,monospace);font-size:12px;cursor:pointer;transition:border-color .2s;}
.qp-more:hover{border-color:var(--gold,#e0a83f);}
.qp-more .qp-spin{display:inline-block;transition:transform .45s cubic-bezier(.34,1.56,.64,1);}
.qp-more:hover .qp-spin{transform:rotate(-200deg);}
.qp-loading{display:flex;justify-content:center;gap:7px;padding:34px 0;}
.qp-loading span{width:10px;height:10px;border-radius:50%;background:var(--gold,#e0a83f);animation:qp-dot 1s ease-in-out infinite;}
.qp-loading span:nth-child(2){animation-delay:.15s;}
.qp-loading span:nth-child(3){animation-delay:.3s;}
.qp-confetti{position:fixed;z-index:5250;width:9px;height:9px;pointer-events:none;animation:qp-burst 1.1s cubic-bezier(.2,.6,.4,1) forwards;}
@keyframes qp-rise{from{opacity:0;transform:translateY(14px) scale(.96);}to{opacity:1;transform:none;}}
@keyframes qp-enter{from{opacity:0;transform:translateX(26px) rotate(1deg);}to{opacity:1;transform:none;}}
@keyframes qp-fade{from{opacity:0;}}
@keyframes qp-pop{0%{transform:scale(1);}40%{transform:scale(1.045);}100%{transform:scale(1);}}
@keyframes qp-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-7px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(2px);}}
@keyframes qp-wiggle{0%,72%,100%{transform:rotate(0);}76%{transform:rotate(-12deg) scale(1.08);}82%{transform:rotate(9deg);}88%{transform:rotate(-5deg);}94%{transform:rotate(2deg);}}
@keyframes qp-boing{0%{transform:scale(.55);}55%{transform:scale(1.28) rotate(8deg);}100%{transform:scale(1);}}
@keyframes qp-tilt{0%,100%{transform:rotate(0);}30%{transform:rotate(-16deg);}65%{transform:rotate(10deg);}}
@keyframes qp-dot{0%,80%,100%{transform:translateY(0);opacity:.35;}40%{transform:translateY(-9px);opacity:1;}}
@keyframes qp-burst{0%{transform:translate(0,0) rotate(0) scale(.4);opacity:1;}25%{transform:translate(calc(var(--dx) * .6),calc(var(--dy) * .6)) rotate(calc(var(--r) * .4)) scale(1.15);opacity:1;}75%{opacity:1;}100%{transform:translate(var(--dx),calc(var(--dy) + 70px)) rotate(var(--r)) scale(.7);opacity:0;}}
@media (prefers-reduced-motion: reduce){
  .qp-overlay,.qp-overlay *,.qp-zoom,.qp-zoom *{animation:none !important;transition:none !important;}
  .qp-opt{opacity:1;} .qp-confetti{display:none;}
}`;
    document.head.appendChild(st);
  }

  function picHtml(src, label){
    return '<button type="button" class="qp-pic-btn" data-label="' + esc(label) + '">🖼️ <span>' + esc(label) + '</span></button>' +
      '<div class="qp-pic"><div><img alt="Figure for this question" data-src="' + esc(src) + '"></div></div>';
  }

  function wirePics(root){
    root.querySelectorAll('.qp-pic-btn').forEach(btn => {
      if(btn.dataset.wired) return;
      btn.dataset.wired = '1';
      const box = btn.nextElementSibling, img = box.querySelector('img');
      btn.addEventListener('click', () => {
        if(!img.getAttribute('src')) img.src = img.dataset.src;   // loaded only when asked for
        const open = box.classList.toggle('open');
        btn.querySelector('span').textContent = open ? 'Hide picture' : btn.dataset.label;
      });
      img.addEventListener('click', () => {
        const z = document.createElement('div');
        z.className = 'qp-zoom';
        z.innerHTML = '<img alt="Figure, enlarged" src="' + esc(img.src) + '">';
        z.addEventListener('click', () => z.remove());
        document.body.appendChild(z);
      });
    });
  }

  function confetti(fromEl){
    const r = fromEl.getBoundingClientRect();
    const colours = ['var(--gold,#e0a83f)', 'var(--good,#5fbf82)', 'var(--blue-bright,#8fc4ea)', '#ff8fb1', '#fff3b0'];
    for(let i = 0; i < 26; i++){
      const p = document.createElement('span');
      const a = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 90;
      p.className = 'qp-confetti';
      p.style.cssText = 'left:' + (r.left + r.width * (0.2 + Math.random() * 0.6)) + 'px;top:' + (r.top + r.height / 2) + 'px;' +
        'background:' + colours[i % colours.length] + ';border-radius:' + (i % 3 ? '2px' : '50%') + ';' +
        '--dx:' + Math.cos(a) * dist + 'px;--dy:' + (Math.sin(a) * dist - 40) + 'px;--r:' + (Math.random() * 540 - 270) + 'deg;';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  function questionHtml(it){
    const q = it.q;
    return '<button type="button" class="qp-x" aria-label="Close">×</button>' +
      '<div class="qp-head"><span class="qp-bubble" aria-hidden="true">?</span><div>' +
        '<div class="qp-kicker">Pop-up quiz</div>' +
        '<div class="qp-where">' + esc(plain(it.s.name)) + ' · ' + esc(it.m.title) + '</div></div></div>' +
      (q.scenario ? '<div class="qp-scn"><b>Scenario</b>' + esc(q.scenario) + '</div>' : '') +
      '<p class="qp-q" id="qpQ">' + esc(q.q) + '</p>' +
      (q.img ? picHtml(q.img, 'Show picture') : '') +
      '<div class="qp-opts" data-own-sfx>' + q.o.map((o, i) =>
        '<button type="button" class="qp-opt" data-i="' + i + '" style="--d:' + (180 + i * 80) + 'ms">' +
          '<span class="qp-letter">' + 'ABCDEFGH'.charAt(i) + '</span><span>' + esc(o) + '</span></button>').join('') +
      '</div><div class="qp-after" aria-live="polite"></div>';
  }

  function afterHtml(it, right, newly, guest){
    const q = it.q, letter = 'ABCDEFGH'.charAt(q.c);
    const verdict = right
      ? (guest ? 'Correct! ✨ Sign in to keep it.' : newly ? 'Correct! ✨ +1 mastered' : 'Correct! ✓ Already mastered')
      : 'Not quite. The answer is ' + letter + '.';
    const study = 'run.html?s=' + encodeURIComponent(it.s.id) + '&m=' + encodeURIComponent(it.m.id);
    return '<div class="qp-verdict ' + (right ? 'ok' : 'no') + '">' + esc(verdict) + '</div>' +
      '<div class="qp-exp"><b>' + esc(q.o[q.c]) + '.</b>' + (q.n ? ' ' + esc(q.n) : '') +
        (q.formula ? '<div class="qp-formula">' + esc(q.formula) + '</div>' : '') +
        (q.steps && q.steps.length ? '<ol class="qp-steps">' + q.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' : '') +
        (q.nimg ? picHtml(q.nimg, 'Show explanation picture') : '') +
        (q.ref ? '<div class="qp-ref">Source · ' + esc(q.ref) + '</div>' : '') +
      '</div>' +
      '<div class="qp-actions">' +
        (guest
          ? '<button type="button" class="qp-go" data-act="signin">Sign in to study <span class="qp-arrow">→</span></button>'
          : '<a class="qp-go" href="' + esc(study) + '">Study this module <span class="qp-arrow">→</span></a>') +
        '<button type="button" class="qp-more" data-act="more" data-own-sfx><span class="qp-spin">↻</span> Another one</button>' +
      '</div>';
  }

  async function open(opts){
    opts = opts || {};
    if(current) return;
    current = {};
    // What's New pops up on Home too; one card at a time.
    while(document.querySelector('.wn-overlay')) await wait(400);
    css();
    const overlay = document.createElement('div');
    overlay.className = 'qp-overlay';
    overlay.innerHTML = '<div class="qp-card" role="dialog" aria-modal="true" aria-labelledby="qpQ" tabindex="-1"><div class="qp-body"><div class="qp-loading" aria-label="Loading a question"><span></span><span></span><span></span></div></div></div>';
    document.body.appendChild(overlay);
    const card = overlay.querySelector('.qp-card'), body = overlay.querySelector('.qp-body');
    let item = null, answered = false, changed = false;

    const close = () => {
      if(!current) return;
      current = null;
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('in');
      overlay.classList.add('out');
      setTimeout(() => overlay.remove(), 320);
      if(changed && !opts.guest && typeof window.leaOnProgressReset === 'function') window.leaOnProgressReset();
    };
    current.close = close;

    const answer = i => {
      if(answered || !item) return;
      answered = true;
      const q = item.q, right = i === q.c;
      const btns = body.querySelectorAll('.qp-opt');
      btns.forEach((b, j) => { b.disabled = true; b.classList.add('done'); if(j !== i && j !== q.c) b.classList.add('dim'); });
      btns[i].classList.add(right ? 'right' : 'wrong');
      if(!right && btns[q.c]) btns[q.c].classList.add('right');
      const bubble = body.querySelector('.qp-bubble');
      bubble.textContent = right ? '★' : '!';
      bubble.classList.add(right ? 'yay' : 'oops');
      let newly = false;
      if(right && window.LEAProgress){
        newly = !isMastered(item);
        LEAProgress.markMastered(item.s.id, item.m.id, item.qi);
        changed = changed || newly;
      }
      sfx(!right ? 'wrong' : newly ? 'complete' : 'correct');
      if(right && !matchMedia('(prefers-reduced-motion: reduce)').matches) confetti(btns[i]);
      const after = body.querySelector('.qp-after');
      after.innerHTML = afterHtml(item, right, newly, opts.guest);
      wirePics(after);
    };

    const show = it => {
      item = it; answered = false;
      if(!it){
        body.innerHTML = '<button type="button" class="qp-x" aria-label="Close">×</button><p class="qp-q" style="margin:28px 0 8px;">Could not load a question just now.</p><div class="qp-actions"><button type="button" class="qp-more" data-act="more"><span class="qp-spin">↻</span> Try again</button></div>';
        return;
      }
      body.innerHTML = questionHtml(it);
      wirePics(body);
    };

    const another = async () => {
      body.classList.add('leave');
      const [it] = await Promise.all([pick(), wait(200)]);
      body.classList.remove('leave');
      show(it);
      if(it) sfx('next');
      body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
    };

    overlay.addEventListener('click', e => {
      if(e.target === overlay || e.target.closest('.qp-x')) return close();
      const opt = e.target.closest('.qp-opt');
      if(opt) return answer(Number(opt.dataset.i));
      const act = e.target.closest('[data-act]');
      if(act && act.dataset.act === 'more') return another();
      if(act && act.dataset.act === 'signin'){ close(); if(opts.onSignIn) opts.onSignIn(); }
    });
    const onKey = e => {
      if(document.querySelector('.qp-zoom')){ if(e.key === 'Escape') document.querySelector('.qp-zoom').remove(); return; }
      if(e.key === 'Escape') close();
      else if(!answered && item && /^[1-8]$/.test(e.key) && Number(e.key) <= item.q.o.length) answer(Number(e.key) - 1);
    };
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('in')));
    card.focus({ preventScroll: true });
    const first = opts.item || await pick();
    show(first);
    if(first) sfx('next');
  }

  // ---------------------------------------------------------------- wiring
  const later = fn => setTimeout(() => window.LEANav && LEANav.afterTransition ? LEANav.afterTransition(fn) : fn(), 700);

  function startHome(isHome){
    const link = takeLink();
    const p = prefs();
    if(link || (p.on && firstThisVisit(VISIT_KEY))){
      markSlot(slot(p.freq).id);
      later(() => (link ? get(link.s, link.m, link.qi) : pick()).then(it => it && open({ item: it })));
    }
    if(timer) return;
    // Each new slot while Home is open: this slot's question, instead of the
    // notification for it.
    timer = setInterval(() => {
      const p = prefs();
      if(!p.on || current || document.hidden || !isHome()) return;
      const s = slot(p.freq);
      let last = null; try{ last = localStorage.getItem(SLOT_KEY); }catch(e){}
      if(last === s.id) return;
      markSlot(s.id);
      forSlot(s.id).then(it => it && open({ item: it }));
    }, 60000);
  }

  function startSignIn(onSignIn){
    const link = takeLink();
    if(!link && !firstThisVisit(TEASE_KEY)) return;
    later(() => (link ? get(link.s, link.m, link.qi) : pick()).then(it => it && open({ item: it, guest: true, onSignIn })));
  }

  window.LEAQuizPop = {
    FREQS, open, pick, get, slot, forSlot, startHome, startSignIn,
    close: () => current && current.close && current.close(),
    isOpen: () => !!current
  };
})();

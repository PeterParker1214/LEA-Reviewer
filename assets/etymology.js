/*
 * Word helper: underlines terms in a question card and opens a small card on tap.
 * Each subject has its own glossary in data/etymology/<subjectId>.json, listed in
 * data/etymology/index.json so subjects without one never trigger a 404.
 *
 * Every entry has a kind:
 *   etymology  - where the word comes from (the History glossary)
 *   definition - what the term means, with an optional memory hook
 *   memory     - a memory hook on its own
 * A missing kind means etymology, so the original History file needs no change.
 *
 * Definitions and memory hooks can give the answer away ("which valve stops
 * backflow?"), so those only appear once the question has been answered.
 * Etymology stays visible before answering, as it always was. Only text already
 * in the card is decorated, so answers and scoring are untouched.
 */
(function(){
  'use strict';
  const BASE = 'data/etymology/';
  let indexPromise = null;
  const glossaries = new Map();
  let activeTooltip = null;
  let activeTrigger = null;

  const KICKER = { etymology:'Etymology', definition:'Definition', memory:'Memory hook' };

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function kindOf(item){ return item.kind || 'etymology'; }

  function loadIndex(){
    if(!indexPromise){
      indexPromise = fetch(BASE + 'index.json', { cache:'no-cache' })
        .then(r => { if(!r.ok) throw new Error('Glossary index failed to load'); return r.json(); })
        .then(map => (map && typeof map === 'object') ? map : {})
        .catch(() => ({}));
    }
    return indexPromise;
  }

  function loadGlossary(subjectId){
    if(!subjectId) return Promise.resolve([]);
    if(!glossaries.has(subjectId)){
      glossaries.set(subjectId, loadIndex().then(index => {
        const file = index[subjectId];
        if(!file) return [];
        return fetch(BASE + file, { cache:'no-cache' })
          .then(r => { if(!r.ok) throw new Error('Glossary failed to load'); return r.json(); })
          .then(items => Array.isArray(items) ? items : [])
          .catch(() => []);
      }));
    }
    return glossaries.get(subjectId);
  }

  function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function decorateTextNode(node, pattern, lookup, subjectId){
    const text = node.nodeValue || '';
    pattern.lastIndex = 0;
    if(!pattern.test(text)) return;
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while((m = pattern.exec(text))){
      const key = m[1];
      const item = lookup.get(key.toLowerCase());
      if(!item) continue;
      if(m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'etymology-word';
      span.setAttribute('role','button');
      span.setAttribute('tabindex','0');
      span.setAttribute('aria-label', KICKER[kindOf(item)] + ' for ' + key);
      span.dataset.etymologyKey = item.term;
      span.dataset.etymologySubject = subjectId;
      span.textContent = key;
      frag.appendChild(span);
      last = m.index + key.length;
    }
    if(last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function isAnswered(root){
    return !!root.querySelector('.explain.right, .explain.wrong');
  }

  function decorate(root, items, subjectId){
    if(!root || !items.length) return;
    const answered = isAnswered(root);
    const usable = items.filter(item => kindOf(item) === 'etymology' || answered);
    if(!usable.length) return;

    const aliases = [];
    const lookup = new Map();
    usable.forEach(item => (item.aliases || [item.term]).forEach(a => {
      aliases.push(a);
      lookup.set(a.toLowerCase(), item);
    }));
    aliases.sort((a,b) => b.length - a.length);
    const pattern = new RegExp('\\b(' + aliases.map(escapeRegex).join('|') + ')\\b', 'gi');

    root.querySelectorAll('.qtext, .opt > span:last-child, .reason').forEach(el => {
      if(el.querySelector('.etymology-word')) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node){
          if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if(node.parentElement && node.parentElement.closest('.etymology-word')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => decorateTextNode(n, pattern, lookup, subjectId));
    });

    addHint(root);
  }

  // The hint only appears on a card that actually has an underlined word, so a
  // subject with a glossary does not promise something a question cannot show.
  function addHint(root){
    const card = root.querySelector('.bp-card') || root;
    const words = card.querySelectorAll('.etymology-word');
    if(!words.length || card.querySelector('.etymology-card-hint')) return;
    const onlyOrigins = Array.from(words).every(w => w.getAttribute('aria-label').indexOf(KICKER.etymology) === 0);
    const hint = document.createElement('span');
    hint.className = 'etymology-card-hint';
    hint.textContent = onlyOrigins ? 'tap underlined words for their origin' : 'tap underlined words to learn them';
    // Sits under the printed head, above the question.
    const chip = card.querySelector('.clock-chip');
    const head = card.querySelector('.page-head');
    if(chip) card.insertBefore(hint, chip);
    else if(head) head.insertAdjacentElement('afterend', hint);
    else card.insertBefore(hint, card.firstChild);
  }

  function closeTooltip(){
    if(activeTooltip) activeTooltip.remove();
    activeTooltip = null;
    if(activeTrigger) activeTrigger.classList.remove('active');
    activeTrigger = null;
  }

  function positionTooltip(tip, trigger){
    const r = trigger.getBoundingClientRect();
    const gap = 10;
    const margin = 12;
    const width = Math.min(360, window.innerWidth - margin * 2);
    tip.style.width = width + 'px';
    tip.style.left = Math.max(margin, Math.min(window.innerWidth - margin - width, r.left + r.width/2 - width/2)) + 'px';
    const h = tip.offsetHeight;
    const below = r.bottom + gap;
    const top = (below + h <= window.innerHeight - margin)
      ? below
      : Math.max(margin, r.top - h - gap);
    tip.style.top = top + 'px';
  }

  function tooltipBody(item, word){
    const kind = kindOf(item);
    let html =
      '<div class="etymology-tooltip-kicker">' + KICKER[kind] + '</div>' +
      '<div class="etymology-tooltip-word">' + escapeHtml(word) + '</div>';
    if(kind === 'etymology'){
      html +=
        '<div class="etymology-tooltip-origin">' + escapeHtml(item.origin || '') + '</div>' +
        (item.breakdown ? '<div class="etymology-tooltip-breakdown">' + escapeHtml(item.breakdown) + '</div>' : '') +
        (item.meaning ? '<div class="etymology-tooltip-meaning">“' + escapeHtml(item.meaning) + '”</div>' : '');
    } else {
      html += item.meaning ? '<div class="etymology-tooltip-meaning">' + escapeHtml(item.meaning) + '</div>' : '';
    }
    html += item.note ? '<div class="etymology-tooltip-note">' + escapeHtml(item.note) + '</div>' : '';
    if(kind !== 'etymology' && item.hook){
      html += '<div class="etymology-tooltip-breakdown etymology-tooltip-hook">Remember: ' + escapeHtml(item.hook) + '</div>';
    }
    if(item.source){
      html += '<a class="etymology-tooltip-source" href="' + escapeHtml(item.source) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>';
    }
    return html;
  }

  function openTooltip(trigger, item){
    if(activeTrigger === trigger){ closeTooltip(); return; }
    closeTooltip();
    const tip = document.createElement('div');
    tip.className = 'etymology-tooltip is-' + kindOf(item);
    tip.setAttribute('role','dialog');
    tip.innerHTML = tooltipBody(item, trigger.textContent);
    document.body.appendChild(tip);
    activeTooltip = tip;
    activeTrigger = trigger;
    trigger.classList.add('active');
    positionTooltip(tip, trigger);
  }

  function openFor(trigger){
    loadGlossary(trigger.dataset.etymologySubject).then(items => {
      const item = items.find(x => x.term === trigger.dataset.etymologyKey);
      if(item) openTooltip(trigger, item);
    });
  }

  function initDelegation(){
    if(window.__leaEtymologyDelegated) return;
    window.__leaEtymologyDelegated = true;
    document.addEventListener('click', e => {
      const trigger = e.target.closest('.etymology-word');
      if(trigger){
        // The word can sit inside an answer button; tapping it must not pick
        // that answer.
        e.preventDefault();
        e.stopPropagation();
        openFor(trigger);
        return;
      }
      if(activeTooltip && !e.target.closest('.etymology-tooltip')) closeTooltip();
    }, true);
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape') closeTooltip();
      const trigger = e.target.closest && e.target.closest('.etymology-word');
      if(trigger && (e.key === 'Enter' || e.key === ' ')){
        e.preventDefault();
        openFor(trigger);
      }
    });
    window.addEventListener('resize', () => { if(activeTooltip && activeTrigger) positionTooltip(activeTooltip, activeTrigger); });
    window.addEventListener('scroll', closeTooltip, { passive:true });
  }

  window.LEAEtymology = {
    decorate(root, subjectId){
      if(!root || !subjectId) return;
      loadIndex().then(index => {
        if(!index[subjectId]) return;
        initDelegation();
        loadGlossary(subjectId).then(items => decorate(root, items, subjectId));
      });
    }
  };
})();

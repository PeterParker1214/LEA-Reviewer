/*
 * History etymology helper.
 * Terms are data-driven so the glossary can be expanded without touching
 * quiz rendering logic. The renderer decorates only text that is already
 * present in the question card, so answers/scoring remain untouched.
 */
(function(){
  'use strict';
  let glossaryPromise = null;
  let activeTooltip = null;
  let activeTrigger = null;

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function loadGlossary(){
    if(!glossaryPromise){
      glossaryPromise = fetch('data/etymology/history.json', { cache:'no-cache' })
        .then(r => { if(!r.ok) throw new Error('Etymology glossary failed to load'); return r.json(); })
        .then(items => Array.isArray(items) ? items : [])
        .catch(() => []);
    }
    return glossaryPromise;
  }

  function makePattern(items){
    const aliases = [];
    items.forEach(item => (item.aliases || [item.term]).forEach(a => aliases.push({ text:a, item }))); 
    aliases.sort((a,b) => b.text.length - a.text.length);
    if(!aliases.length) return null;
    return new RegExp('\\b(' + aliases.map(x => x.text.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  }

  function decorateTextNode(node, pattern, lookup){
    const text = node.nodeValue || '';
    pattern.lastIndex = 0;
    if(!pattern.test(text)) return;
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while((m = pattern.exec(text))){
      if(m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const key = m[1];
      const item = lookup(key.toLowerCase());
      const span = document.createElement('span');
      span.className = 'etymology-word';
      span.setAttribute('role','button');
      span.setAttribute('tabindex','0');
      span.setAttribute('aria-label','Show etymology for ' + key);
      span.dataset.etymologyKey = item.term;
      span.textContent = key;
      frag.appendChild(span);
      last = m.index + key.length;
    }
    if(last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function decorate(root, items){
    if(!root || !items.length) return;
    const aliases = [];
    const lookup = new Map();
    items.forEach(item => (item.aliases || [item.term]).forEach(a => { aliases.push({ text:a, item }); lookup.set(a.toLowerCase(), item); }));
    aliases.sort((a,b) => b.text.length - a.text.length);
    const pattern = makePattern(items);
    if(!pattern) return;

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
      nodes.forEach(n => decorateTextNode(n, pattern, key => lookup.get(key)));
    });
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

  function openTooltip(trigger, item){
    if(activeTrigger === trigger){ closeTooltip(); return; }
    closeTooltip();
    const tip = document.createElement('div');
    tip.className = 'etymology-tooltip';
    tip.setAttribute('role','dialog');
    tip.innerHTML =
      '<div class="etymology-tooltip-kicker">ETYMOLOGY</div>' +
      '<div class="etymology-tooltip-word">' + escapeHtml(trigger.textContent) + '</div>' +
      '<div class="etymology-tooltip-origin">' + escapeHtml(item.origin || '') + '</div>' +
      (item.breakdown ? '<div class="etymology-tooltip-breakdown">' + escapeHtml(item.breakdown) + '</div>' : '') +
      (item.meaning ? '<div class="etymology-tooltip-meaning">“' + escapeHtml(item.meaning) + '”</div>' : '') +
      '<div class="etymology-tooltip-note">' + escapeHtml(item.note || '') + '</div>' +
      (item.source ? '<a class="etymology-tooltip-source" href="' + escapeHtml(item.source) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>' : '');
    document.body.appendChild(tip);
    activeTooltip = tip;
    activeTrigger = trigger;
    trigger.classList.add('active');
    positionTooltip(tip, trigger);
  }

  function initDelegation(){
    if(window.__leaEtymologyDelegated) return;
    window.__leaEtymologyDelegated = true;
    document.addEventListener('click', e => {
      const trigger = e.target.closest('.etymology-word');
      if(trigger){
        e.preventDefault();
        loadGlossary().then(items => {
          const item = items.find(x => x.term === trigger.dataset.etymologyKey);
          if(item) openTooltip(trigger, item);
        });
        return;
      }
      if(activeTooltip && !e.target.closest('.etymology-tooltip')) closeTooltip();
    });
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape') closeTooltip();
      const trigger = e.target.closest && e.target.closest('.etymology-word');
      if(trigger && (e.key === 'Enter' || e.key === ' ')){
        e.preventDefault();
        loadGlossary().then(items => {
          const item = items.find(x => x.term === trigger.dataset.etymologyKey);
          if(item) openTooltip(trigger, item);
        });
      }
    });
    window.addEventListener('resize', () => { if(activeTooltip && activeTrigger) positionTooltip(activeTooltip, activeTrigger); });
    window.addEventListener('scroll', closeTooltip, { passive:true });
  }

  window.LEAEtymology = {
    decorate(root, subjectId){
      if(subjectId !== 'history-of-architecture') return;
      initDelegation();
      loadGlossary().then(items => decorate(root, items));
    }
  };
})();

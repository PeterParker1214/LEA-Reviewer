/* Pure messaging rules shared by the full page, dock, and tests. */
(function(root){
  'use strict';
  function receipt(reads, who, message, me, nameOf){
    if(!message || message.user_id !== me) return '';
    const readers = [...new Set(reads.filter(r => Number(r.last_read_id) >= Number(message.id) &&
      (who === null ? r.thread === 'lobby' && r.user_id !== me : r.user_id === who && r.thread === me))
      .map(r => r.user_id))];
    return readers.length ? 'Seen by ' + readers.slice(0, 2).map(nameOf).join(' and ') +
      (readers.length > 2 ? ' + ' + (readers.length - 2) : '') : 'Sent';
  }
  function sameThread(a,b){
    if(a.to_user == null || b.to_user == null) return a.to_user == null && b.to_user == null;
    return a.user_id === b.user_id && a.to_user === b.to_user || a.user_id === b.to_user && a.to_user === b.user_id;
  }
  function mentions(text, people, me, who){
    const candidates=people.filter(p=>p.id!==me && (who===null || p.id===who))
      .map(p=>({label:p.username,id:p.id}));
    if(who===null)candidates.push({label:'everyone',id:null});
    candidates.sort((a,b)=>b.label.length-a.label.length);
    const found=[];
    for(let i=0;i<text.length;i++){
      if(text[i]!=='@'||(i>0&&!/\s|[([{]/.test(text[i-1])))continue;
      const match=candidates.find(p=>text.slice(i+1,i+1+p.label.length).toLowerCase()===p.label.toLowerCase() &&
        (i+1+p.label.length===text.length || /[\s.,!?;:)\]}]/.test(text[i+1+p.label.length])));
      if(match){found.push({id:match.id,start:i,end:i+match.label.length+1});i+=match.label.length;}
    }
    return found;
  }
  function typers(rows, who, me, now){
    return [...new Set(rows.filter(r=>r.user_id!==me && r.typing &&
      now-Date.parse(r.updated_at)<8000 && now-Date.parse(r.updated_at)>-2000 &&
      (who===null?r.thread==='lobby':r.user_id===who&&r.thread===me)).map(r=>r.user_id))];
  }
  root.LEAMessengerModel={receipt,sameThread,mentions,typers};
})(typeof window==='undefined'?globalThis:window);

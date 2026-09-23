/* One messaging UI for chat.html and the lazy desktop/mobile dock. */
(function(window){
  'use strict';
  const M=window.LEAMessengerModel, C=window.LEAChat;
  const EMOJI=['👍','❤️','😂','😮','😢','🙏'];
  const FIELDS='id,user_id,to_user,body,image_url,created_at,reply_to,mentions,mention_everyone';
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>';
  const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function button(cls,text,label,fn){const n=el('button',cls,text);n.type='button';if(label)n.setAttribute('aria-label',label);if(fn)n.onclick=fn;return n;}
  function check(result){if(result.error)throw result.error;return result.data||[];}
  function safeUrl(url){try{const u=new URL(url);return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch(e){return '';}}
  class Messenger {
    constructor(root,sb,user,opts){
      this.root=root;this.sb=sb;this.me=user.id;this.opts=opts||{};this.people=new Map();this.messages=[];this.parents=new Map();this.reads=[];this.reactions=[];this.typing=[];this.inbox=[];this.previews=new Map();this.drafts=new Map();this.who=undefined;this.generation=0;this.dead=false;this.visible=!opts.dock;this.busy=false;this.uploading=false;this.reply=null;this.attachment=null;this.hasMore=false;this.receiptPending=false;this.lastTyping=0;this.typingOn=false;this.listeners=[];this.root.classList.add('lea-messenger');this.root.dataset.conversation='false';
      this.build();this.bind();this.ready=this.start();
    }
    person(id){return this.people.get(id)||{id,username:'Reviewer',avatar_url:null};}
    face(id){const p=this.person(id),n=el('span','lea-msg-face');const url=safeUrl(p.avatar_url);if(url){const img=el('img','');img.src=url;img.alt='';n.append(img);}else n.textContent=(p.username||'?').slice(0,2).toUpperCase();return n;}
    listen(target,event,fn){target.addEventListener(event,fn);this.listeners.push(()=>target.removeEventListener(event,fn));}
    build(){
      this.root.innerHTML='<div class="lea-msg-layout"><section class="lea-msg-sidebar" aria-label="Conversations"><div class="lea-msg-heading"><h2>Messages</h2></div><input class="lea-msg-search" type="search" placeholder="Search people…" aria-label="Search people"><div class="lea-msg-list"></div></section><section class="lea-msg-main" aria-label="Conversation"><div class="lea-msg-top"></div><div class="lea-msg-stream" tabindex="0" aria-label="Messages"></div><div class="lea-msg-status" role="status" hidden></div><div class="lea-msg-reply" hidden></div><div class="lea-msg-attachment" hidden></div><div class="lea-msg-mentions" aria-label="Mention suggestions" hidden></div><div class="lea-msg-typing" role="status" hidden></div><form class="lea-msg-compose" hidden><textarea rows="1" maxlength="1000" placeholder="Message…" aria-label="Message"></textarea></form></section></div>';
      const q=s=>this.root.querySelector(s);
      this.search=q('.lea-msg-search');this.list=q('.lea-msg-list');this.top=q('.lea-msg-top');this.stream=q('.lea-msg-stream');this.status=q('.lea-msg-status');this.replyBox=q('.lea-msg-reply');this.attachmentBox=q('.lea-msg-attachment');this.suggestions=q('.lea-msg-mentions');this.typingBox=q('.lea-msg-typing');this.form=q('form');this.input=q('textarea');
      q('.lea-msg-heading').append(button('lea-msg-icon','＋','New message',()=>{this.showInbox();this.search.focus();}));
      if(this.opts.dock)q('.lea-msg-heading').append(button('lea-msg-icon','−','Minimize messages',()=>this.setVisible(false)));
      this.file=el('input','');this.file.type='file';this.file.accept=C.IMAGE_TYPES.join(',');this.file.hidden=true;
      this.form.prepend(button('lea-msg-icon','＋','Attach a picture or GIF',()=>this.file.click()),button('lea-msg-icon','@','Mention a person',()=>{
        const at=this.input.selectionStart;this.input.setRangeText((at&&!/\s/.test(this.input.value[at-1])?' ':'')+'@',at,this.input.selectionEnd,'end');this.input.focus();this.suggest();
      }));
      this.sendButton=button('lea-msg-send','→','Send message');this.sendButton.type='submit';this.sendButton.disabled=true;this.form.append(this.sendButton,this.file);
    }
    bind(){
      this.search.oninput=()=>this.drawInbox();this.form.onsubmit=e=>{e.preventDefault();this.send();};
      this.input.oninput=()=>{this.input.style.height='auto';this.input.style.height=Math.min(110,this.input.scrollHeight)+'px';this.suggest();this.publishTyping(!!this.input.value.trim());};
      this.input.onkeydown=e=>{
        if(e.isComposing)return;
        if(e.key==='Escape'){e.preventDefault();this.hideSuggestions();return;}
        if(e.key==='ArrowDown'&&!this.suggestions.hidden){e.preventDefault();this.suggestions.querySelector('button')?.focus();return;}
        if(e.key==='Enter'&&!e.shiftKey&&matchMedia('(pointer:fine)').matches){e.preventDefault();if(!this.suggestions.hidden)this.suggestions.querySelector('button')?.click();else this.send();}
      };
      this.suggestions.onkeydown=e=>{const buttons=[...this.suggestions.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}if(e.key==='Escape'){this.hideSuggestions();this.input.focus();}};
      this.file.onchange=()=>{const f=this.file.files[0];this.file.value='';if(f)this.upload(f);};
      this.input.onpaste=e=>{const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(f){e.preventDefault();this.upload(f);}};
      this.stream.onscroll=()=>this.markRead();
      this.listen(document,'visibilitychange',()=>{if(document.hidden)this.publishTyping(false);else if(this.visible)this.refresh();});
      this.listen(window,'focus',()=>{if(this.visible){this.markRead();this.refresh();}});
      this.listen(window,'blur',()=>this.publishTyping(false));
      this.listen(window,'online',()=>this.refresh());
      this.listen(window,'pagehide',()=>this.publishTyping(false));
      this.listen(this.root,'click',e=>{if(!this.form.contains(e.target)&&!this.suggestions.contains(e.target))this.hideSuggestions();});
      if(window.visualViewport)this.listen(window.visualViewport,'resize',()=>{this.root.style.setProperty('--lea-msg-viewport',window.visualViewport.height+'px');});
      this.expiry=setInterval(()=>this.drawTyping(),1000);
      this.poll=setInterval(()=>{if(!document.hidden)this.refresh();},20000);
    }
    async start(){
      this.list.replaceChildren(el('div','lea-msg-empty','Loading messages…'));
      try{
        for(let offset=0;!this.dead;offset+=1000){const rows=check(await this.sb.from('profiles').select('id,username,avatar_url,is_admin').range(offset,offset+999));rows.forEach(p=>this.people.set(p.id,p));if(rows.length<1000)break;}
        if(this.dead)return;
        this.admin=!!this.person(this.me).is_admin;
        this.watch();await this.refreshInbox();
        if(this.opts.to&&this.opts.to!==this.me&&this.people.has(this.opts.to))await this.open(this.opts.to);
        else if(!this.opts.dock&&matchMedia('(min-width:701px)').matches)await this.open(null);
        else this.stream.replaceChildren(el('div','lea-msg-empty','Choose a conversation to start.'));
      }catch(e){if(!this.dead){this.list.replaceChildren(el('div','lea-msg-empty','Messages could not load.'));this.list.append(button('lea-msg-more','Try again',null,()=>this.retry()));}}
    }
    async retry(){if(this.channel){await this.sb.removeChannel(this.channel);this.channel=null;}this.ready=this.start();}
    watch(){
      this.channel=this.sb.channel('messenger-'+this.me+'-'+Math.random().toString(36).slice(2));
      ['chat_messages','chat_reactions','chat_reads'].forEach(table=>this.channel.on('postgres_changes',{event:'*',schema:'public',table},()=>this.scheduleRefresh()));
      this.channel.on('postgres_changes',{event:'*',schema:'public',table:'chat_typing'},({new:r})=>{if(this.dead||!r?.user_id)return;this.typing=this.typing.filter(x=>!(x.user_id===r.user_id&&x.thread===r.thread));this.typing.push(r);this.drawTyping();});
      this.channel.subscribe(status=>{if(this.dead)return;if(status==='SUBSCRIBED')this.scheduleRefresh();});
    }
    scheduleRefresh(){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.refresh(),160);}
    async refresh(){
      if(this.dead||this.refreshing)return;this.refreshing=true;
      try{await this.refreshInbox();if(this.visible&&this.who!==undefined)await this.load(false);}catch(e){if(this.visible)this.say('Connection interrupted. Your draft is saved here. We’ll retry automatically.');}finally{this.refreshing=false;}
    }
    async refreshInbox(){
      const rows=check(await this.sb.rpc('chat_inbox'));if(this.dead)return;
      const ids=rows.map(r=>r.last_id);const previews=ids.length?check(await this.sb.from('chat_messages').select(FIELDS).in('id',ids)):[];
      if(this.dead)return;this.inbox=rows;this.previews=new Map(previews.map(m=>[String(m.id),m]));this.drawInbox();
      this.opts.onUnread?.(rows.reduce((sum,r)=>sum+Number(r.unread),0));
    }
    drawInbox(){
      if(this.dead)return;this.list.replaceChildren();
      const row=(who,label,preview,count)=>{const b=button('lea-msg-row',null,null,()=>this.open(who));b.dataset.peer=who===null?'lobby':who;b.setAttribute('aria-current',String(this.who===who));b.append(who===null?el('span','lea-msg-face','#'):this.face(who));const copy=el('span','lea-msg-row-copy');copy.append(el('b','',label),el('small','',preview));b.append(copy);if(count){const badge=el('span','lea-msg-count',count>99?'99+':count);badge.setAttribute('aria-label',count+' unread');b.append(badge);}return b;};
      const community=this.inbox.find(r=>r.peer===null);this.list.append(el('div','lea-msg-caption','Community'),row(null,'LEA Lobby','Study together, ask anything',Number(community?.unread||0)),el('div','lea-msg-caption','Direct messages'));
      const q=this.search.value.trim().toLowerCase();let rows;
      if(q)rows=[...this.people.values()].filter(p=>p.id!==this.me&&p.username?.toLowerCase().includes(q)).slice(0,40).map(p=>({peer:p.id}));
      else rows=this.inbox.filter(r=>r.peer!==null).sort((a,b)=>Number(b.last_id)-Number(a.last_id));
      rows.forEach(r=>{const m=this.previews.get(String(r.last_id));this.list.append(row(r.peer,this.person(r.peer).username,m?(m.user_id===this.me?'You: ':'')+(m.body||'Picture'):'Start a conversation',Number(r.unread||0)));});
      if(!rows.length)this.list.append(el('div','lea-msg-empty',q?'No people found.':'Search a name to start a conversation.'));
    }
    saveDraft(){if(this.who!==undefined)this.drafts.set(C.threadName(this.who),{text:this.input.value,reply:this.reply,attachment:this.attachment});}
    async open(who){
      if(this.dead||this.busy||this.uploading)return;
      this.saveDraft();this.publishTyping(false);this.who=who;this.generation++;this.messages=[];this.parents.clear();this.reactions=[];this.hasMore=false;this.visible=true;this.root.hidden=false;this.root.dataset.conversation='true';this.hideSuggestions();this.say('');
      const draft=this.drafts.get(C.threadName(who))||{};this.input.value=draft.text||'';this.reply=draft.reply||null;this.attachment=draft.attachment||null;
      this.top.replaceChildren(button('lea-msg-icon lea-msg-back','←','Back to conversations',()=>this.showInbox()));
      const title=el('div','lea-msg-title',who===null?'Community':this.person(who).username);title.append(el('span','lea-msg-subtitle',who===null?'Ask a question. Review together.':'Direct conversation'));this.top.append(title);
      if(who===null)this.top.append(button('lea-msg-icon','ⓘ','Community members',()=>this.details()));
      if(this.opts.dock){const expand=el('a','lea-msg-icon','↗');expand.href='chat.html'+(who?'?to='+encodeURIComponent(who):'?community=1');expand.setAttribute('aria-label','Open full messages page');this.top.append(expand,button('lea-msg-icon','−','Minimize messages',()=>this.setVisible(false)));}
      this.form.hidden=false;this.drawDraft();this.drawInbox();this.stream.replaceChildren(el('div','lea-msg-empty','Loading conversation…'));
      try{await this.load(false,true);}catch(e){this.say('Could not load this conversation. Try again.');this.stream.replaceChildren(button('lea-msg-more','Try again',null,()=>this.open(who)));}
    }
    showInbox(){if(this.busy||this.uploading)return;this.saveDraft();this.publishTyping(false);this.who=undefined;this.generation++;this.root.dataset.conversation='false';this.hideSuggestions();this.form.hidden=true;this.replyBox.hidden=true;this.attachmentBox.hidden=true;this.typingBox.hidden=true;this.drawInbox();}
    setVisible(on){this.visible=on;this.root.hidden=!on;this.opts.onVisible?.(on);if(on){this.refresh();this.markRead();}else{this.saveDraft();this.publishTyping(false);this.hideSuggestions();}}
    query(who){let q=this.sb.from('chat_messages').select(FIELDS);return who===null?q.is('to_user',null):q.or('and(user_id.eq.'+this.me+',to_user.eq.'+who+'),and(user_id.eq.'+who+',to_user.eq.'+this.me+')');}
    async load(older,forceBottom){
      const generation=this.generation,who=this.who;if(who===undefined||this.dead)return;
      if(older&&this.loadingOlder)return;
      const serial=this.loadSerial=(this.loadSerial||0)+1;
      if(older)this.loadingOlder=true;
      try{
        let q=this.query(who).order('id',{ascending:false});
        if(older&&this.messages.length)q=q.lt('id',this.messages[0].id);
        // Refresh every loaded page, preserving older history and deletion state.
        const limit=older?50:Math.max(50,this.messages.length);const rows=check(await q.limit(limit));
        if(this.dead||generation!==this.generation||serial!==this.loadSerial)return;
        this.hasMore=rows.length===limit;const combined=older?[...rows,...this.messages]:rows;
        this.messages=[...new Map(combined.map(m=>[String(m.id),m])).values()].sort((a,b)=>Number(a.id)-Number(b.id));
        const ids=this.messages.map(m=>m.id),parentIds=[...new Set(this.messages.map(m=>m.reply_to).filter(Boolean))];
        const [parents,reactions,reads,typing]=await Promise.all([
          parentIds.length?this.sb.from('chat_messages').select(FIELDS).in('id',parentIds):Promise.resolve({data:[]}),
          ids.length?this.sb.from('chat_reactions').select('message_id,user_id,emoji').in('message_id',ids):Promise.resolve({data:[]}),
          this.sb.from('chat_reads').select('user_id,thread,last_read_id'),
          this.sb.from('chat_typing').select('user_id,thread,typing,updated_at').gte('updated_at',new Date(Date.now()-10000).toISOString())
        ]);
        if(this.dead||generation!==this.generation||serial!==this.loadSerial)return;
        this.parents=new Map(check(parents).map(m=>[String(m.id),m]));this.reactions=check(reactions);this.reads=check(reads);this.typing=check(typing);
        this.drawMessages(!!forceBottom,!!older);this.drawTyping();this.markRead();
      }finally{if(older)this.loadingOlder=false;}
    }
    textContent(text,message){
      const fragment=document.createDocumentFragment();let pos=0;
      const matches=M.mentions(text,[...this.people.values()],null,null);
      matches.forEach(m=>{fragment.append(document.createTextNode(text.slice(pos,m.start)));const tagged=m.id===null?message.mention_everyone:(message.mentions||[]).includes(m.id);fragment.append(tagged?el('span','lea-msg-mention',text.slice(m.start,m.end)):document.createTextNode(text.slice(m.start,m.end)));pos=m.end;});fragment.append(document.createTextNode(text.slice(pos)));return fragment;
    }
    drawMessages(forceBottom,older){
      const latest=[...this.messages].reverse().find(m=>m.user_id===this.me);
      // Polls and realtime events redraw constantly; skip when nothing changed so open pickers, focus and playing GIFs survive.
      const key=JSON.stringify([this.who,this.hasMore,this.messages,[...this.parents.keys()],this.reactions,latest&&M.receipt(this.reads,this.who,latest,this.me,id=>id)]);
      if(!forceBottom&&!older&&key===this.drawn)return;this.drawn=key;
      const bottom=this.nearBottom(),before=this.stream.scrollHeight,top=this.stream.scrollTop;
      this.stream.replaceChildren();if(this.hasMore)this.stream.append(button('lea-msg-more','Earlier messages',null,()=>this.load(true).catch(()=>this.say('Could not load earlier messages.'))));
      if(!this.messages.length)this.stream.append(el('div','lea-msg-empty',this.who===null?'Nothing here yet. Say hello.':'Start the conversation.'));
      this.messages.forEach(m=>{
        const mine=m.user_id===this.me,n=el('article','lea-msg-message'+(mine?' mine':'')+(!mine&&(m.mention_everyone||(m.mentions||[]).includes(this.me))?' lea-msg-mentioned':''));n.dataset.message=m.id;
        n.append(this.face(m.user_id));const body=el('div','lea-msg-body');if(!mine){const name=el('a','lea-msg-name',this.person(m.user_id).username);name.href='user.html?u='+encodeURIComponent(m.user_id);body.append(name);}
        const bubble=el('div','lea-msg-bubble');
        if(m.reply_to){const parent=this.parents.get(String(m.reply_to));const quote=button('lea-msg-quote',null,null,()=>this.jump(m.reply_to));if(parent&&M.sameThread(m,parent)){quote.append(el('b','',this.person(parent.user_id).username),document.createTextNode((parent.body||'Picture').slice(0,180)));}else{quote.textContent='Original message unavailable';quote.disabled=true;}bubble.append(quote);}
        if(m.body)bubble.append(this.textContent(m.body,m));
        const url=safeUrl(m.image_url);if(url){const media=el(C.isVideo(url)?'video':'img','lea-msg-photo');media.src=url;if(media.tagName==='VIDEO'){media.autoplay=true;media.loop=true;media.muted=true;media.playsInline=true;}else{media.alt='Shared image';media.loading='lazy';}bubble.append(media);}
        body.append(bubble);
        const reactions=el('div','lea-msg-reactions');EMOJI.forEach(emoji=>{const users=this.reactions.filter(r=>String(r.message_id)===String(m.id)&&r.emoji===emoji);if(!users.length)return;const b=button('lea-msg-reaction',emoji+' '+users.length,emoji+' from '+users.map(r=>this.person(r.user_id).username).join(', '),()=>this.react(m,emoji));b.setAttribute('aria-pressed',String(users.some(r=>r.user_id===this.me)));reactions.append(b);});if(reactions.childNodes.length)body.append(reactions);
        const actions=el('div','lea-msg-actions');actions.append(el('span','lea-msg-time',C.shortTime(m.created_at)),button('lea-msg-action','Reply','Reply to '+this.person(m.user_id).username,()=>{this.reply=m;this.drawDraft();this.input.focus();}));
        const picker=el('div','lea-msg-reactions');picker.hidden=true;EMOJI.forEach(emoji=>picker.append(button('lea-msg-reaction',emoji,'React with '+emoji,()=>this.react(m,emoji))));const react=button('lea-msg-action','React',null,()=>{picker.hidden=!picker.hidden;react.setAttribute('aria-expanded',String(!picker.hidden));});react.setAttribute('aria-expanded','false');actions.append(react);if(mine||this.admin)actions.append(button('lea-msg-action','Delete',null,()=>this.remove(m)));
        body.append(actions,picker);if(latest&&String(latest.id)===String(m.id)){const receipt=el('div','lea-msg-receipt',M.receipt(this.reads,this.who,m,this.me,id=>this.person(id).username));receipt.setAttribute('role','status');body.append(receipt);}
        n.append(body);this.stream.append(n);
      });
      if(forceBottom||bottom&&!older)this.stream.scrollTop=this.stream.scrollHeight;else if(older)this.stream.scrollTop=top+this.stream.scrollHeight-before;else this.stream.scrollTop=top;
    }
    async jump(id){
      let target=this.stream.querySelector('[data-message="'+id+'"]');
      if(!target){this.say('Load earlier messages to view the original.');return;}
      this.root.querySelectorAll('.lea-msg-highlight').forEach(n=>n.classList.remove('lea-msg-highlight'));target.classList.add('lea-msg-highlight');this.stream.scrollTop+=target.getBoundingClientRect().top-this.stream.getBoundingClientRect().top-14;
    }
    nearBottom(){return this.stream.scrollHeight-this.stream.scrollTop-this.stream.clientHeight<40;}
    async markRead(){
      if(this.dead||!this.visible||this.who===undefined||document.hidden||!document.hasFocus()||!this.nearBottom()||!this.stream.getClientRects().length||this.receiptPending||!this.messages.length)return;
      const rect=this.stream.getBoundingClientRect();if(rect.bottom>window.innerHeight+2||rect.top<0)return;
      const who=this.who,thread=C.threadName(who),last=this.messages[this.messages.length-1];const old=this.reads.find(r=>r.user_id===this.me&&r.thread===thread);
      if(Number(old?.last_read_id||0)>=Number(last.id))return;this.receiptPending=true;
      try{const row={user_id:this.me,thread,last_read_id:last.id};check(await this.sb.from('chat_reads').upsert(row,{onConflict:'user_id,thread'}));if(this.dead)return;this.reads=this.reads.filter(r=>!(r.user_id===this.me&&r.thread===thread));this.reads.push(row);await this.refreshInbox();}catch(e){/* Retry on the next visible refresh, never optimistically mark read. */}finally{this.receiptPending=false;}
    }
    drawDraft(){
      this.replyBox.replaceChildren();this.replyBox.hidden=!this.reply;if(this.reply){const q=el('div','lea-msg-quote');q.append(el('b','','Replying to '+this.person(this.reply.user_id).username),document.createTextNode((this.reply.body||'Picture').slice(0,160)));this.replyBox.append(q,button('lea-msg-icon','×','Cancel reply',()=>{this.reply=null;this.drawDraft();}));}
      this.attachmentBox.replaceChildren();this.attachmentBox.hidden=!this.attachment&&!this.uploading;
      if(this.uploading)this.attachmentBox.textContent='Preparing image…';else if(this.attachment){const thumb=el(C.isVideo(this.attachment.url)?'video':'img','');thumb.src=this.attachment.url;if(thumb.tagName==='VIDEO'){thumb.muted=true;thumb.autoplay=true;thumb.loop=true;thumb.playsInline=true;}else thumb.alt='';this.attachmentBox.append(thumb,el('span','','Picture ready'),button('lea-msg-action','Remove',null,()=>{this.attachment=null;this.drawDraft();}));}
      this.sendButton.disabled=this.busy||this.uploading||!C.sendable(this.input.value,this.attachment?.url);
    }
    say(message){if(this.dead)return;this.status.textContent=message;this.status.hidden=!message;}
    hideSuggestions(){this.suggestions.hidden=true;this.input.setAttribute('aria-expanded','false');}
    suggest(){
      this.drawDraft();const end=this.input.selectionStart,match=/(?:^|\s)@([^@\n]{0,40})$/.exec(this.input.value.slice(0,end));this.suggestions.replaceChildren();if(!match||this.who===undefined){this.hideSuggestions();return;}
      let people=[...this.people.values()].filter(p=>p.id!==this.me&&(this.who===null||p.id===this.who));if(this.who===null)people.unshift({id:null,username:'everyone'});
      people=people.filter(p=>p.username.toLowerCase().startsWith(match[1].toLowerCase())).slice(0,6);if(!people.length){this.hideSuggestions();return;}
      people.forEach(p=>this.suggestions.append(button('','@'+p.username+(p.id===null?' · Everyone in Community':''),null,()=>{this.input.setRangeText('@'+p.username+' ',end-match[1].length-1,end,'end');this.hideSuggestions();this.input.focus();this.drawDraft();this.publishTyping(true);})));this.suggestions.hidden=false;this.input.setAttribute('aria-expanded','true');
    }
    async send(){
      if(this.dead||this.busy||this.uploading||this.who===undefined)return;const payload=C.sendable(this.input.value,this.attachment?.url);if(!payload)return;
      const who=this.who,text=payload.body||'',matches=M.mentions(text,[...this.people.values()],this.me,who);this.busy=true;this.drawDraft();this.say('');
      try{
        const sent=check(await this.sb.from('chat_messages').insert({...payload,user_id:this.me,to_user:who,reply_to:this.reply?.id||null,mentions:[...new Set(matches.map(m=>m.id).filter(Boolean))],mention_everyone:matches.some(m=>m.id===null)}).select(FIELDS));
        if(this.dead)return;
        this.input.value='';this.input.style.height='auto';this.reply=null;this.attachment=null;this.drafts.delete(C.threadName(who));this.hideSuggestions();this.publishTyping(false);
        // The returned row is authoritative even if realtime is temporarily disconnected.
        const row=sent[0];if(row&&!this.messages.some(m=>String(m.id)===String(row.id)))this.messages.push(row);this.drawMessages(true);await this.refreshInbox();
      }catch(e){if(!this.dead)this.say(/row-level security/i.test(e.message||'')?'Could not send. Wait a moment and try again.':e.message||'Could not send. Your draft is still here.');}finally{this.busy=false;if(!this.dead)this.drawDraft();}
    }
    async react(message,emoji){
      if(this.reacting||this.dead)return;this.reacting=true;
      try{const old=this.reactions.find(r=>String(r.message_id)===String(message.id)&&r.user_id===this.me);if(old?.emoji===emoji)check(await this.sb.from('chat_reactions').delete().eq('message_id',message.id).eq('user_id',this.me));else check(await this.sb.from('chat_reactions').upsert({message_id:message.id,user_id:this.me,emoji},{onConflict:'message_id,user_id'}));await this.load(false);}catch(e){this.say('Could not save your reaction. Try again.');}finally{this.reacting=false;}
    }
    async remove(message){
      const ok=window.LEAConfirm?await window.LEAConfirm('Delete this message?',{title:'Delete message',yes:'Delete'}):window.confirm('Delete this message?');if(!ok||this.dead)return;
      try{check(await this.sb.from('chat_messages').delete().eq('id',message.id));await this.refresh();}catch(e){this.say('Could not delete this message.');}
    }
    async upload(file){
      if(this.dead||this.uploading||this.who===undefined)return;const problem=C.imageProblem(file);if(problem){this.say(problem);return;}
      this.uploading=true;this.drawDraft();const generation=this.generation;
      try{if(C.needsShrinking(file))file=await C.shrinkToFit(file);if(C.shouldConvertGif(file))file=await C.gifToVideo(file);if(this.dead)return;
        const ext=file.type==='video/webm'?'webm':file.type==='image/gif'?'gif':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=this.me+'/'+crypto.randomUUID()+'.'+ext;
        check(await this.sb.storage.from('chat-images').upload(path,file,{contentType:file.type,cacheControl:'3600'}));if(this.dead||generation!==this.generation)return;this.attachment={url:this.sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl,path};
      }catch(e){this.say(e.message||'Could not upload this image.');}finally{this.uploading=false;if(!this.dead)this.drawDraft();}
    }
    publishTyping(on){
      if(this.who===undefined||this.dead)return;clearTimeout(this.idleTimer);
      if(on){this.idleTimer=setTimeout(()=>this.publishTyping(false),4000);if(Date.now()-this.lastTyping<2500&&this.typingOn)return;}
      else if(!this.typingOn)return;
      this.lastTyping=Date.now();this.typingOn=on;
      const row={user_id:this.me,thread:C.threadName(this.who),typing:on};
      // Serialize so a delayed "typing" cannot arrive after the stop marker.
      this.typingWrite=(this.typingWrite||Promise.resolve()).catch(()=>{}).then(()=>this.sb.from('chat_typing').upsert(row,{onConflict:'user_id,thread'})).catch(()=>{});
    }
    drawTyping(){if(this.dead)return;const ids=this.who===undefined?[]:M.typers(this.typing,this.who,this.me,Date.now());this.typingBox.hidden=!ids.length||!this.visible;this.typingBox.textContent=ids.length?ids.slice(0,2).map(id=>this.person(id).username).join(' and ')+(ids.length>1?' are typing…':' is typing…'):'';}
    details(){this.root.querySelector('.lea-msg-details')?.remove();const box=el('aside','lea-msg-details');box.append(button('lea-msg-icon','×','Close community members',()=>box.remove()),el('div','lea-msg-caption','Community members'));[...this.people.values()].forEach(p=>{const row=el('div','lea-msg-row');row.append(this.face(p.id),el('span','',p.username));box.append(row);});this.root.querySelector('.lea-msg-main').append(box);}
    destroy(){if(this.dead)return;this.publishTyping(false);this.dead=true;this.generation++;clearInterval(this.poll);clearInterval(this.expiry);clearTimeout(this.idleTimer);clearTimeout(this.refreshTimer);this.listeners.forEach(stop=>stop());if(this.channel)this.sb.removeChannel(this.channel);this.root.replaceChildren();this.drafts.clear();}
  }
  let dock=null,launcher=null,dockUser=null,authStop=null;
  function badges(count){document.querySelectorAll('[data-message-count]').forEach(n=>{n.textContent=count>99?'99+':count;n.hidden=!count;});}
  function removeDock(){if(dock)dock.destroy();dock?.root.remove();launcher?.remove();dock=null;launcher=null;dockUser=null;authStop?.();authStop=null;badges(0);}
  function installDock(sb,user){
    if(dockUser===user.id)return dock;if(dock)removeDock();dockUser=user.id;
    const root=el('aside','lea-msg-dock');root.hidden=true;root.setAttribute('aria-label','Messages');root.id='lea-message-dock';document.body.append(root);
    launcher=button('lea-msg-launch',null,'Open messages',()=>dock.setVisible(!dock.visible));launcher.setAttribute('aria-controls',root.id);launcher.setAttribute('aria-expanded','false');launcher.innerHTML=icon+'<span>Messages</span><span class="lea-msg-count" data-message-count hidden></span><span class="lea-msg-chevron" aria-hidden="true">⌃</span>';document.body.append(launcher);
    dock=new Messenger(root,sb,user,{dock:true,onUnread:badges,onVisible:on=>{launcher?.setAttribute('aria-expanded',String(on));if(launcher)launcher.querySelector('.lea-msg-chevron').textContent=on?'⌄':'⌃';}});
    const handler=e=>{const trigger=e.target.closest('[data-open-messages]');if(trigger){e.preventDefault();dock?.setVisible(true);}};document.addEventListener('click',handler);const auth=sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')removeDock();});authStop=()=>{document.removeEventListener('click',handler);auth.data.subscription.unsubscribe();};return dock;
  }
  window.LEAMessenger={mount:(root,sb,user,opts)=>new Messenger(root,sb,user,opts||{}),installDock,removeDock,icon};
})(window);

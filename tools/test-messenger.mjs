import {readFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const read=name=>readFileSync(new URL('../assets/'+name,import.meta.url),'utf8');
runInThisContext(read('messenger-model.js'));
const M=globalThis.LEAMessengerModel;
const me='00000000-0000-4000-8000-000000000001',ana='00000000-0000-4000-8000-000000000002',kev='00000000-0000-4000-8000-000000000003';
const people=[{id:me,username:'Me'},{id:ana,username:'Ana Cruz'},{id:kev,username:'Kevin'}];
assert.equal(M.receipt([{user_id:ana,thread:me,last_read_id:9}],ana,{id:8,user_id:me},me,()=> 'Ana'),'Seen by Ana');
assert.equal(M.receipt([{user_id:kev,thread:me,last_read_id:90}],ana,{id:8,user_id:me},me,()=> 'Kevin'),'Sent','an unrelated private receipt is not proof of reading');
assert.equal(M.sameThread({user_id:me,to_user:ana},{user_id:ana,to_user:me}),true);
assert.equal(M.sameThread({user_id:me,to_user:ana},{user_id:me,to_user:null}),false);
assert.deepEqual(M.mentions('email@Kevin @everyone @Ana Cruz, hi @Kevin!',people,me,null).map(m=>m.id),[null,ana,kev]);
assert.deepEqual(M.mentions('@everyone @Kevin @Ana Cruz',people,me,ana).map(m=>m.id),[ana]);
assert.deepEqual(M.mentions('@KevinXYZ',people,me,null),[]);
const now=Date.now();
assert.deepEqual(M.typers([{user_id:ana,thread:me,typing:true,updated_at:new Date(now).toISOString()},{user_id:kev,thread:me,typing:true,updated_at:new Date(now).toISOString()},{user_id:ana,thread:'lobby',typing:true,updated_at:new Date(now-9000).toISOString()}],ana,me,now),[ana]);

// Real UI running against a deterministic API double. No production messages.
const dom=new JSDOM('<main id="app"></main>',{url:'https://lea.test/chat.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.matchMedia=()=>({matches:true});w.confirm=()=>true;
Object.defineProperty(w.document,'hasFocus',{value:()=>true});
for(const file of ['chat.js','messenger-model.js','messenger.js'])w.eval(read(file));
const calls=[];
const db={profiles:people,chat_messages:[{id:1,user_id:ana,to_user:null,body:'Hi @Me <img onerror=alert(1)>',mentions:[me],mention_everyone:false,created_at:new Date().toISOString()},{id:2,user_id:ana,to_user:me,body:'Private',mentions:[],created_at:new Date().toISOString()}],chat_reads:[],chat_typing:[],chat_reactions:[]};
let failSend=false,failReads=false;
function query(table){let action='select',payload,filters=[],limit=1000,descending=false;const api={select(){return api},range(){return api},order(k,v){descending=!v.ascending;return api},limit(n){limit=n;return api},is(k,v){filters.push(x=>x[k]==v);return api},or(){filters.push(x=>x.to_user===ana&&x.user_id===me||x.to_user===me&&x.user_id===ana);return api},in(k,v){filters.push(x=>v.map(String).includes(String(x[k])));return api},eq(k,v){filters.push(x=>x[k]===v);return api},lt(k,v){filters.push(x=>x[k]<v);return api},gte(){return api},insert(p){action='insert';payload=p;return api},upsert(p){action='upsert';payload=p;return api},delete(){action='delete';return api},then(resolve,reject){return Promise.resolve().then(()=>{
 calls.push({table,action,payload});if(table==='chat_messages'&&action==='insert'&&failSend)return {error:{message:'Offline'}};if(table==='chat_reads'&&failReads)return {error:{message:'Offline'}};
 if(action==='insert'){const row={id:db[table].length+1,created_at:new Date().toISOString(),...payload};db[table].push(row);return {data:[row]};}
 if(action==='upsert'){const key=table==='chat_reactions'?'message_id':'thread';const old=db[table].find(x=>x.user_id===payload.user_id&&x[key]===payload[key]);if(old)Object.assign(old,payload);else db[table].push({...payload});return {data:[]};}
 if(action==='delete'){db[table]=db[table].filter(x=>!filters.every(f=>f(x)));return {data:[]};}
 let rows=db[table].filter(x=>filters.every(f=>f(x)));if(descending)rows=rows.slice().sort((a,b)=>b.id-a.id);return {data:rows.slice(0,limit)};
 }).then(resolve,reject)}};return api;}
const sb={from:query,rpc:async()=>({data:[{peer:null,last_id:1,unread:1},{peer:ana,last_id:2,unread:1}]}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{},auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
const app=w.LEAMessenger.mount(w.document.getElementById('app'),sb,{id:me},{dock:true});await app.ready;await app.open(null);
assert.equal(app.stream.querySelector('img'),null,'message HTML is rendered as text');
assert.equal(app.stream.querySelector('.lea-msg-mention').textContent,'@Me','incoming mention of current user highlights');
app.input.value='@';app.input.setSelectionRange(1,1);app.suggest();assert.equal(app.suggestions.querySelectorAll('button').length,3);
app.suggestions.querySelector('button').click();assert.equal(app.input.value,'@everyone ');
app.reply=db.chat_messages[0];app.input.value='@everyone @Ana Cruz hello';await app.send();
const sent=db.chat_messages.at(-1);assert.equal(sent.reply_to,1);assert.equal(sent.mention_everyone,true);assert.deepEqual(Array.from(sent.mentions),[ana]);assert.equal(app.input.value,'');
app.input.value='Keep this draft';failSend=true;await app.send();assert.equal(app.input.value,'Keep this draft');assert.equal(app.status.textContent,'Offline');failSend=false;
await app.open(ana);app.input.value='Private draft';await app.open(null);assert.equal(app.input.value,'Keep this draft','draft stays in original conversation');await app.open(ana);assert.equal(app.input.value,'Private draft');
await app.react(db.chat_messages[1],'👍');assert.equal(db.chat_reactions.length,1);await app.react(db.chat_messages[1],'👍');assert.equal(db.chat_reactions.length,0,'second tap removes your reaction');
const kept=app.stream.querySelector('article');await app.load(false);assert.equal(app.stream.querySelector('article'),kept,'unchanged refresh keeps the DOM');
app.stream.getClientRects=()=>[{}];app.stream.getBoundingClientRect=()=>({top:10,bottom:200});app.setVisible(false);const before=calls.filter(x=>x.table==='chat_reads').length;await app.markRead();assert.equal(calls.filter(x=>x.table==='chat_reads').length,before,'minimized chat never marks read');
app.visible=true;failReads=true;await app.markRead();assert.equal(app.reads.length,0,'failed writes are not marked locally');failReads=false;await app.markRead();assert.equal(app.reads.length,1,'visible conversation persists read marker');
app.publishTyping(true);app.publishTyping(false);await app.typingWrite;assert.equal(db.chat_typing.at(-1).typing,false);
app.destroy();dom.window.close();console.log('messenger: model, mentions, replies, reactions, drafts, visibility, read-write failures and typing passed');

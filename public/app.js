import { COLORS, sortedAccounts } from './accounts.js';
const $=s=>document.querySelector(s), period=18000000;
let reminders=[];try{reminders=JSON.parse(localStorage.getItem('reminders')||'[]');}catch{}
let removedAccount=null,syncQueue=Promise.resolve(),syncVersion=0;
let token=localStorage.getItem('token'),editing=null;
const status=t=>$('#status').textContent=t;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
function animate(element,frames,options){
  if(!reduceMotion.matches && !document.hidden && element.animate)element.animate(frames,options);
}
function cardPositions(){return new Map([...document.querySelectorAll('.card')].map(card=>[card.dataset.id,card.getBoundingClientRect().top]));}
function moveCards(before){
  for(const card of document.querySelectorAll('.card')){
    const oldTop=before.get(card.dataset.id),distance=oldTop-card.getBoundingClientRect().top;
    if(oldTop!==undefined && Math.abs(distance)>1)animate(card,[{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{duration:350,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}
reduceMotion.addEventListener('change',()=>{if(reduceMotion.matches)document.getAnimations().forEach(animation=>animation.cancel());});
async function api(route,data){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try {
    const r=await fetch('/api/'+route,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
    let value;try{value=await r.json();}catch{throw Error(`The server returned an unexpected response (HTTP ${r.status}). Please report this code.`);}
    if(!r.ok)throw Error(value.error||`Request failed (HTTP ${r.status}).`);return value;
  }catch(e){if(e.name==='AbortError')throw Error('The request timed out after 20 seconds. Check your internet connection and try again.');throw e;}
  finally{clearTimeout(timer);}
}
async function sync(){
  localStorage.setItem('reminders',JSON.stringify(reminders));render();
  $('#retry').hidden=true;
  if(!token){status('Saved on this device. Enable notifications for alerts.');return;}
  const version=++syncVersion,snapshot=structuredClone(reminders);
  status('Syncing…');
  // Keep quick actions (including Undo) in order on the server.
  const job=syncQueue.then(()=>api('reminders',{reminders:snapshot}));
  syncQueue=job.catch(()=>{});
  try{await job;if(version===syncVersion)status('');}
  catch(e){if(version===syncVersion){status('Saved here, but alerts are not updated. '+e.message);$('#retry').hidden=false;}}
}
function removeAccount(account){
  removedAccount={...account};reminders=reminders.filter(r=>r.id!==account.id);
  $('#undo-message').textContent=account.name+' removed';$('#undo-bar').hidden=false;
  sync();$('#undo').focus({preventScroll:true});
}
$('#undo').onclick=()=>{
  if(!removedAccount)return;
  if(reminders.length>=30){status('Remove another account before restoring this one.');return;}
  reminders.push(removedAccount);removedAccount=null;$('#undo-bar').hidden=true;sync();$('#add').focus({preventScroll:true});
};
$('#dismiss-undo').onclick=()=>{removedAccount=null;$('#undo-bar').hidden=true;$('#add').focus({preventScroll:true});};
$('#retry').onclick=()=>sync();
function formError(message,input){$('#form-error').textContent=message;if(input){input.setAttribute('aria-invalid','true');input.focus();}}
$('#form').addEventListener('input',e=>{e.target.removeAttribute('aria-invalid');$('#form-error').textContent='';});

function next(r){const now=Date.now();return r.anchor>now?r.anchor:r.anchor+(Math.floor((now-r.anchor)/period)+1)*period;}
function render(){const before=cardPositions();const root=$('#accounts');root.replaceChildren();$('#count').textContent=reminders.length;if(!reminders.length){const el=document.createElement('div');el.className='empty';el.innerHTML='<strong>No accounts yet</strong><p>Tap + to add your first reset.</p>';root.append(el);}for(const r of sortedAccounts(reminders)){const card=document.createElement('article');card.className='card color-'+(COLORS.includes(r.color)?r.color:'blue')+(r.paused?' is-paused':'');card.dataset.id=r.id;card.innerHTML='<div class="card-art" aria-hidden="true"><span></span><span></span><span></span></div><div class="card-top"><div class="account-avatar" aria-hidden="true"></div><div class="account-heading"><h3></h3><p class="account-email"></p></div><span class="pill"></span></div><div class="timer"></div><div class="reset-time"></div><div class="actions"></div>';card.querySelector('h3').textContent=r.name;card.querySelector('.account-avatar').textContent=[...r.name.trim()][0]?.toUpperCase()||'A';const email=card.querySelector('.account-email');email.textContent=r.email||'';email.hidden=!r.email;card.querySelector('.pill').textContent=r.paused?'Paused':'5h';card.querySelector('.timer').dataset.id=r.id;const actions=card.querySelector('.actions');for(const [label,fn] of [['Edit',()=>open(r)],[r.paused?'Resume':'Pause',()=>{r.paused=!r.paused;sync();const updated=[...document.querySelectorAll('.card')].find(card=>card.dataset.id===r.id);updated?.querySelectorAll('button')[1]?.focus({preventScroll:true});}],['Remove',()=>removeAccount(r)]]){const b=document.createElement('button');b.className='text';b.textContent=label;b.onclick=fn;b.setAttribute('aria-label',label+' '+r.name);actions.append(b);}root.append(card);if(!before.has(r.id))animate(card,[{opacity:0,transform:'translateY(18px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:450,delay:Math.min(root.children.length-1,5)*65,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});}moveCards(before);tick();$('#test').hidden=!token;$('#enable').textContent=token?'Reconnect':'Enable';$('#install').hidden=!!token;$('#notification-state').textContent=token && window.Notification?.permission==='granted'?'Enabled':window.Notification?.permission==='denied'?'Blocked':'Not enabled';}
function tick(){const root=$('#accounts'),before=cardPositions();let reordered=false;for(const [index,r] of sortedAccounts(reminders).entries()){const card=[...root.children].find(el=>el.dataset.id===r.id);if(card && root.children[index]!==card){root.insertBefore(card,root.children[index]||null);reordered=true;}}if(reordered)moveCards(before);for(const el of document.querySelectorAll('.timer')){const r=reminders.find(r=>r.id===el.dataset.id),time=next(r),seconds=Math.max(0,Math.ceil((time-Date.now())/1000));el.textContent=r.paused?'Paused':[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');el.nextElementSibling.textContent=r.paused?'Alerts paused':'Resets '+new Date(time).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}}
function open(r){$('#form-error').textContent='';document.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));editing=r?.id||null;$('#form-title').textContent=r?'Edit reset':'Add account';$('#name').value=r?.name||'';$('#email').value=r?.email||'';const color=COLORS.includes(r?.color)?r.color:COLORS[reminders.length%COLORS.length];document.querySelectorAll('[name=color]').forEach(input=>input.checked=input.value===color);const d=new Date(r?next(r):Date.now()+period);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('#anchor').value=d.toISOString().slice(0,16);$('#anchor').dataset.initial=$('#anchor').value;$('#editor').showModal();animate($('#editor'),[{opacity:0,transform:'translateY(24px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});}
$('#add').onclick=()=>open();$('#close').onclick=()=>$('#editor').close();$('#form').onsubmit=e=>{
  e.preventDefault();
  const name=$('#name').value.trim(),email=$('#email').value.trim(),anchor=new Date($('#anchor').value).getTime();
  if(!name)return formError('Add an account name.',$('#name'));
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return formError('Enter a valid email or leave it blank.',$('#email'));
  const unchanged=editing && $('#anchor').value===$('#anchor').dataset.initial;
  if(!Number.isSafeInteger(anchor) || (anchor<=Date.now() && !unchanged) || anchor>Date.now()+366*86400000)return formError('Choose a future reset time within one year.',$('#anchor'));
  if(!editing && reminders.length>=30)return formError('You can save up to 30 accounts.');
  const old=reminders.find(r=>r.id===editing),color=document.querySelector('[name=color]:checked').value;
  const r={id:editing||crypto.randomUUID(),name,email,color,anchor:old && unchanged?old.anchor:anchor,paused:old?.paused||false};
  reminders=editing?reminders.map(x=>x.id===editing?r:x):[...reminders,r];
  $('#editor').close();sync();$('#add').focus({preventScroll:true});
};
$('#enable').onclick=async()=>{const b=$('#enable');b.disabled=true;status('Connecting…');try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw Error('Install this app on your Home Screen using Safari, then open it there. Requires iOS 16.4 or later.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications are not enabled. Check this app’s notification permission in iPhone Settings.');await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;const {publicKey}=await fetch('/api/key').then(r=>r.json());const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});const result=await api('register',{subscription,code:prompt('Enter your setup code:')||''});token=result.token;localStorage.setItem('token',token);await sync();}catch(e){status(e.message);}finally{b.disabled=false;}};
$('#test').onclick=async()=>{
  const button=$('#test');button.disabled=true;button.textContent='Sending…';status('Sending…');
  try{await api('test',{});const message='Test sent. Check Notification Center.';status(message);alert(message);}
  catch(e){status(e.message);alert(e.message);}
  finally{button.disabled=false;button.textContent='Test notification';}
};
$('#notification-settings').open=!token;
window.addEventListener('online',()=>{if(token)sync();});
window.addEventListener('offline',()=>status('Offline. Changes stay on this device until you reconnect.'));render();setInterval(tick,1000);if(token)sync();

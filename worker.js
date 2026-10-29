import webpush from 'web-push';
import { createECDH } from 'node:crypto';
import { dueSlot, nextReset } from './schedule.js';
const NEVER=8640000000000000;
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function validSubscription(s) {
  if(!s || typeof s.endpoint!=='string' || s.endpoint.length>4096 || !s.keys) return false;
  try { const u=new URL(s.endpoint); return u.protocol==='https:' && !u.port && !u.username && !u.password && /^(web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$/.test(u.hostname) && ['p256dh','auth'].every(k=>typeof s.keys[k]==='string' && /^[A-Za-z0-9_-]{16,200}$/.test(s.keys[k])); } catch { return false; }
}
export function validateReminders(rows,now=Date.now()) {
  return Array.isArray(rows) && rows.length<=30 && new Set(rows.map(r=>r?.id)).size===rows.length && rows.every(r=>r && typeof r.id==='string' && r.id.length>0 && r.id.length<=80 && typeof r.name==='string' && r.name.trim() && r.name.length<=60 && Number.isSafeInteger(r.anchor) && r.anchor>=0 && r.anchor<=now+366*86400000 && typeof r.paused==='boolean');
}
export function wakeTime(rows,now) {return Math.min(NEVER,...rows.filter(r=>!r.paused).map(r=>nextReset(r.anchor,now)));}
function pushError(code,message){const error=new Error(message);error.safeMessage=message;error.code=code;return error;}
export function buildPush(env,subscription,payload) {
  const publicKey=env.VAPID_PUBLIC_KEY,privateKey=env.VAPID_PRIVATE_KEY;
  if(typeof publicKey!=='string' || !/^[A-Za-z0-9_-]{87}$/.test(publicKey))throw pushError('PUBLIC_KEY_FORMAT','VAPID_PUBLIC_KEY must contain only the 87-character public key. Check for spaces or a copied label in Cloudflare.');
  if(typeof privateKey!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(privateKey))throw pushError('PRIVATE_KEY_FORMAT','VAPID_PRIVATE_KEY must contain only the 43-character private key. Check for spaces or a copied label in Cloudflare.');
  const curve=createECDH('prime256v1');
  try{curve.setPrivateKey(Buffer.from(privateKey,'base64url'));}catch{throw pushError('PRIVATE_KEY_INVALID','The saved VAPID_PRIVATE_KEY is invalid. Recopy it from the original key generator output.');}
  if(curve.getPublicKey().toString('base64url')!==publicKey)throw pushError('KEY_PAIR_MISMATCH','The saved public and private VAPID keys do not match. Copy both from the same key generator output.');
  try{const subject=new URL(env.VAPID_SUBJECT);if(!['mailto:','https:'].includes(subject.protocol))throw Error();}catch{throw pushError('SUBJECT_INVALID','VAPID_SUBJECT must be a valid mailto: email address or HTTPS URL. Check its value in Cloudflare.');}
  try{return webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:600,vapidDetails:{subject:env.VAPID_SUBJECT,publicKey,privateKey}});}
  catch{throw pushError('ENCRYPTION_FAILED','Notification encryption failed. Please report error code ENCRYPTION_FAILED.');}
}
async function send(env,subscription,payload) {
  const details=buildPush(env,subscription,payload);
  let response;
  try{response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch(error){throw pushError('PUSH_NETWORK',error.name==='TimeoutError'?'The push service timed out. Try again shortly.':'The server could not connect to the push service. Please report error code PUSH_NETWORK.');}
  await response.body?.cancel();
  if(!response.ok) {const error=new Error('Push delivery failed');error.status=response.status;throw error;}
}
async function handle(request,env) {
  const url=new URL(request.url),route=url.pathname;
  if(!route.startsWith('/api/')) return env.ASSETS.fetch(request);
  if(!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT || !env.APP_CODE) return reply(503,{error:'The owner needs to finish notification setup.'});
  if(route==='/api/key' && request.method==='GET') return reply(200,{publicKey:env.VAPID_PUBLIC_KEY});
  if(request.method!=='POST') return reply(405,{error:'Method not allowed'});
  if(request.headers.get('sec-fetch-site')==='cross-site' || (request.headers.has('origin') && request.headers.get('origin')!==url.origin)) return reply(403,{error:'Same-origin requests only'});
  if(!request.headers.get('content-type')?.includes('application/json')) return reply(415,{error:'JSON required'});
  // Bound streamed bodies, including requests without a Content-Length header.
  const reader=request.body?.getReader();let length=0,chunks=[];
  if(!reader) return reply(400,{error:'Missing request body'});
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>32768){await reader.cancel();return reply(413,{error:'Request too large'});}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'Invalid JSON'});}
  if(!input || typeof input!=='object') return reply(400,{error:'Invalid request'});
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(route==='/api/register') {
    if(input.code!==env.APP_CODE) return reply(403,{error:'Enter the private setup code created during deployment.'});
    if(!validSubscription(input.subscription)) return reply(400,{error:'Invalid push subscription'});
    const existing=await env.DB.prepare('SELECT token FROM clients WHERE endpoint = ?').bind(input.subscription.endpoint).first();
    if(!existing){const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM clients').first();if(count.total>=10)return reply(429,{error:'Personal app limit: 10 devices'});}
    const id=crypto.randomUUID()+crypto.randomUUID();
    // Updating the subscription retains reminders until the browser sync completes.
    await env.DB.prepare('INSERT INTO clients(token, endpoint, subscription) VALUES(?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET token=excluded.token, subscription=excluded.subscription, version=clients.version+1').bind(id,input.subscription.endpoint,JSON.stringify(input.subscription)).run();
    return reply(200,{token:id});
  }
  const client=await env.DB.prepare('SELECT * FROM clients WHERE token = ?').bind(token).first();
  if(!client)return reply(401,{error:'Enable notifications again to reconnect this device'});
  if(route==='/api/reminders') {
    if(!validateReminders(input.reminders))return reply(400,{error:'Invalid reminders'});
    const now=Date.now(),old=JSON.parse(client.reminders);
    const rows=input.reminders.map(r=>({id:r.id,name:r.name.trim(),anchor:r.anchor,paused:r.paused,last:old.find(o=>o.id===r.id && o.anchor===r.anchor)?.last??dueSlot(r.anchor,now)}));
    // Preserve a pending due slot when a browser sync overlaps the scheduled trigger.
    const due=Math.min(NEVER,...rows.filter(r=>!r.paused).map(r=>{const slot=dueSlot(r.anchor,now);return slot!==null && (r.last===null || slot>r.last)?slot:nextReset(r.anchor,now);}));
    await env.DB.prepare('UPDATE clients SET reminders=?, next_due=?, version=version+1 WHERE token=?').bind(JSON.stringify(rows),due,token).run();
    return reply(200,{ok:true});
  }
  if(route==='/api/test'){
    try{await send(env,JSON.parse(client.subscription),{title:'Notifications are ready',body:'Your five-hour reminders will arrive here.',tag:'test'});return reply(200,{ok:true});}
    catch(error){
      const message=error.safeMessage || ([404,410].includes(error.status)?'This notification subscription has expired. Tap Enable notifications to reconnect.':
        [401,403].includes(error.status)?'The push service rejected notification authentication. Check that the public and private VAPID keys in Cloudflare are a matching pair.':
        error.status?`The push service rejected the test (HTTP ${error.status}). Please report this code.`:
        'The server could not prepare the notification. Please report this error and check Worker logs.');
      console.error('Test notification failed:',error.code||error.status||error.name);return reply(502,{error:message});
    }
  }
  return reply(404,{error:'Not found'});
}
export async function runScheduled(env,now=Date.now()) {
  const {results}=await env.DB.prepare('SELECT * FROM clients WHERE next_due <= ? AND lease_until <= ? ORDER BY next_due LIMIT 1').bind(now,now).all();
  // One device per minute bounds crypto work on the Free plan. Due accounts on that device share one push.
  for(const client of results){
    const lease=await env.DB.prepare('UPDATE clients SET lease_until=? WHERE token=? AND lease_until<=? AND version=?').bind(now+120000,client.token,now,client.version).run();
    if(!lease.meta.changes)continue;
    const rows=JSON.parse(client.reminders),due=[];
    for(const r of rows){const slot=dueSlot(r.anchor,now);if(r.paused || slot===null || (r.last!==null && slot<=r.last))continue;r.last=slot;if(now-slot<=10*60000)due.push(r);}
    try{
      if(due.length)await send(env,JSON.parse(client.subscription),{title:due.length===1?`${due[0].name}: reset reminder`:`${due.length} accounts: reset reminder`,body:due.length===1?'Your scheduled reset time has arrived. Your five-hour schedule continues.':due.map(r=>r.name).join(', '),tag:'scheduled-reset'});
      await env.DB.prepare('UPDATE clients SET reminders=?, next_due=?, lease_until=0, version=version+1 WHERE token=? AND version=?').bind(JSON.stringify(rows),wakeTime(rows,now),client.token,client.version).run();
    }catch(error){if([404,410].includes(error.status))await env.DB.prepare('DELETE FROM clients WHERE token=? AND version=?').bind(client.token,client.version).run();else console.error('Push delivery failed:',error.status||'network');}
  }
}
export default {
  async fetch(request,env){try{return await handle(request,env);}catch(error){console.error('Request failed:',error.status||error.name);return reply(502,{error:'Could not sync or send notification. Please try again.'});}},
  async scheduled(event,env,ctx){ctx.waitUntil(runScheduled(env));}
};

import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import webpush from 'web-push';
import { dueSlot } from './schedule.js';
const dir = process.env.DATA_DIR || './data';
await mkdir(dir, { recursive: true });
async function load(file, fallback) { try { return JSON.parse(await readFile(path.join(dir,file),'utf8')); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; } }
async function save(file, value) { const p=path.join(dir,file); await writeFile(p+'.tmp',JSON.stringify(value),{mode:0o600}); await rename(p+'.tmp',p); }
let keys=await load('keys.json',null);
if(!keys) { keys=webpush.generateVAPIDKeys(); await save('keys.json',keys); }
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com',keys.publicKey,keys.privateKey);
let clients=await load('clients.json',{});
let queue=Promise.resolve();
function serial(fn) { const job=queue.then(fn); queue=job.catch(()=>{}); return job; }
function json(res,status,obj) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); }
async function body(req) { let text=''; for await(const chunk of req) { text+=chunk; if(text.length>32768) throw Error('Request too large'); } return JSON.parse(text); }
function validSubscription(s) {
  if(!s || typeof s.endpoint!=='string' || s.endpoint.length>4096 || !s.keys) return false;
  try { const u=new URL(s.endpoint); return u.protocol==='https:' && !u.port && !u.username && !u.password && /^(web\.push\.apple\.com|.*\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|.*\.notify\.windows\.com)$/.test(u.hostname) && ['p256dh','auth'].every(k=>typeof s.keys[k]==='string' && /^[A-Za-z0-9_-]{16,200}$/.test(s.keys[k])); } catch { return false; }
}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const files=new Set(['index.html','app.js','style.css','sw.js','manifest.webmanifest','icon.svg']);
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'");
  try {
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/api/key' && req.method==='GET') return json(res,200,{publicKey:keys.publicKey});
    if(pathname.startsWith('/api/') && req.method==='POST') {
      if(req.headers['sec-fetch-site']==='cross-site') return json(res,403,{error:'Same-origin requests only'});
      const input=await body(req);
      return await serial(async()=>{
        const token=req.headers.authorization?.replace(/^Bearer /,'');
        if(pathname==='/api/register') {
          if(!validSubscription(input.subscription)) return json(res,400,{error:'Invalid push subscription'});
          if(Object.keys(clients).length>=1000) return json(res,429,{error:'Device limit reached'});
          if(token && Object.hasOwn(clients,token)) delete clients[token];
          for(const [existing,c] of Object.entries(clients)) if(c.subscription.endpoint===input.subscription.endpoint) delete clients[existing];
          const id=randomBytes(32).toString('hex');
          clients[id]={subscription:input.subscription,reminders:[],updated:Date.now()};
          await save('clients.json',clients); return json(res,200,{token:id});
        }
        const client=Object.hasOwn(clients,token)?clients[token]:null; if(!client) return json(res,401,{error:'Enable notifications again to reconnect this device'});
        if(pathname==='/api/reminders') {
          if(!Array.isArray(input.reminders) || input.reminders.length>30 || input.reminders.some(r=>!r || typeof r.id!=='string' || r.id.length>80 || typeof r.name!=='string' || !r.name.trim() || r.name.length>60 || !Number.isSafeInteger(r.anchor) || r.anchor<0 || r.anchor>Date.now()+366*86400000 || typeof r.paused!=='boolean')) return json(res,400,{error:'Invalid reminders'});
          client.reminders=input.reminders.map(r=>{const old=client.reminders.find(o=>o.id===r.id && o.anchor===r.anchor); return {id:r.id,name:r.name,anchor:r.anchor,paused:r.paused,last:old?.last??dueSlot(r.anchor,Date.now())};});
          client.updated=Date.now(); await save('clients.json',clients); return json(res,200,{ok:true});
        }
        if(pathname==='/api/test') { await webpush.sendNotification(client.subscription,JSON.stringify({title:'Notifications are ready',body:'Your five-hour reminders will arrive here.',tag:'test'}),{TTL:300,timeout:10000}); return json(res,200,{ok:true}); }
        return json(res,404,{error:'Not found'});
      });
    }
    if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!files.has(file)) return json(res,404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});res.end(await readFile(new URL('./public/'+file,import.meta.url)));
  } catch(e) { console.error('Request failed:',e.statusCode || e.message); if(!res.headersSent) json(res,400,{error:'Request failed. Check your connection and notification setup.'}); else res.end(); }
});
setInterval(()=>serial(async()=>{
  let changed=false;
  for(const [id,client] of Object.entries(clients)) for(const r of client.reminders) {
    const now=Date.now(), slot=dueSlot(r.anchor,now);
    if(r.paused || slot===null || (r.last!==null && slot<=r.last)) continue;
    // Avoid delivering stale reminders after an outage. Preserve the original anchor.
    if(now-slot>10*60000) { r.last=slot; changed=true; continue; }
    try { await webpush.sendNotification(client.subscription,JSON.stringify({title:`${r.name}: reset reminder`,body:'Your scheduled reset time has arrived. The next reminder is in five hours.',tag:r.id}),{TTL:600,timeout:10000}); r.last=slot;changed=true; }
    catch(e) { if(e.statusCode===410 || e.statusCode===404) { delete clients[id];changed=true;break; } console.error('Push delivery failed:',e.statusCode || 'network'); }
  }
  if(changed) await save('clients.json',clients);
}).catch(e=>console.error('Scheduler failed:',e.message)),15000).unref();
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Reset Reminder listening'));

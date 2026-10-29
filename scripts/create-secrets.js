import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import webpush from 'web-push';
const contact=process.argv[2];
if(!contact || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)){console.error('Usage: npm run keys -- mailto:you@example.com');process.exit(1);}
const keys=webpush.generateVAPIDKeys();
await writeFile('.secrets.json',JSON.stringify({VAPID_SUBJECT:contact,VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,APP_CODE:randomBytes(24).toString('base64url')},null,2),{mode:0o600,flag:'wx'});
console.log('Created private .secrets.json. Keep it private; do not commit it. Upload with: npx wrangler secret bulk .secrets.json');

# Free hosting with Cloudflare

The app now supports Workers static assets, a Worker API, D1 storage, and a once-per-minute Cron Trigger. No always-on server, paid domain, or Apple developer account is needed. Stay on **Workers Free**; do not upgrade for this app.

Official pricing checked against Cloudflare's documentation repository during implementation:
- Workers Free: 100,000 requests/day and 10 ms CPU per invocation; static asset requests are free and unlimited.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage.
- Sources: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/

Personal usage should fit the quotas, but live CPU use and iPhone delivery still need checking after deployment. Free quotas are not a delivery guarantee; exceeding quotas can interrupt reminders. One due device is processed per minute to bound crypto work; simultaneous accounts on that device share a notification. With multiple devices delivery can take extra minutes. This app permits up to 10 devices and 30 reminders/device.

## One-time deployment

Create a free account at https://dash.cloudflare.com/sign-up. You do not need to send passwords, tokens, or setup codes in chat. These commands require an authenticated Cloudflare CLI in the environment running them:

```sh
npm ci
npx wrangler login
npx wrangler d1 create reset-reminders
```

Copy the returned database ID into `wrangler.jsonc` in place of the all-zero `database_id`. Keep the `DB` binding name. Then:

```sh
npm run db:remote
npm run keys -- mailto:YOUR_EMAIL_ADDRESS
npx wrangler secret bulk .secrets.json
npm run deploy
```

If Wrangler asks to create the Worker while adding secrets, accept. Use the free `workers.dev` address printed by deployment; no domain purchase required. Secret generation refuses to overwrite an existing `.secrets.json`: reuse the existing file on subsequent deployments to keep subscriptions valid. The file is ignored by Git; keep a secure backup. It contains `APP_CODE`, which you privately read and enter on your iPhone when enabling notifications. This code prevents strangers from registering devices. Neither `.dev.vars` nor local test keys are deployed by Wrangler.

In a managed cloud workspace, interactive browser login may not complete. Use the platform's secure credential settings to provide a scoped Cloudflare API token and account ID, or run deployment on a computer where Wrangler login works. Do not paste tokens in chat. This workspace also requires network access to Cloudflare's API for deployment. No cloud account has been connected or remote resources created by the implementation work.

Cron configuration can take several minutes to propagate. Once deployed, confirm the `* * * * *` trigger in the dashboard and inspect Workers logs for scheduler errors. Check CPU usage stays within the Free plan limit before relying on reminders.

## iPhone setup

1. On iOS 16.4+, open your deployed HTTPS address in Safari.
2. Share → Add to Home Screen, then open **Reset** from that icon.
3. Tap Enable notifications, allow permission, and enter your private setup code.
4. Tap Send a test notification.
5. Add a test reminder a few minutes ahead. Close the app and confirm notification delivery, then check the next countdown is five hours later.
6. Add your actual account labels and reset times.

The app cannot confirm ChatGPT limits. Focus settings, internet connectivity, service limits, and push delivery can delay reminders. A server interruption skips notifications more than ten minutes old while preserving the original five-hour schedule.

## Local development and verification

```sh
npm ci
npm test
npm run db:local
npm run dev:cloud
npx wrangler deploy --dry-run
```

For local push configuration, create ignored `.dev.vars` with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `APP_CODE`. Use separate development keys. Scheduled events can be triggered locally at `/__scheduled` when using `dev:cloud`.

The Node server (`npm start`) remains available as the original local prototype. The Cloudflare Worker is the deployment target. Local data in `data/` is not automatically migrated to D1; on the deployed origin, add your reminders and enable notifications again.

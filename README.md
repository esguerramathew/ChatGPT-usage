# Reset

An iPhone-friendly installable web app for manually scheduled ChatGPT account reminders. Each account repeats from its chosen anchor every five hours. This does not read ChatGPT usage or verify actual resets.

## Recommended free deployment

Use the Cloudflare version described in [CLOUDFLARE.md](CLOUDFLARE.md). It replaces the always-running Node server with a scheduled Worker and D1 database. The instructions below describe the original Node prototype.

## Run

Requires Node.js 22.13 or newer (Node 24 recommended).

```sh
npm ci
npm test
VAPID_SUBJECT=mailto:you@example.com npm start
```

Default port: 3000. Set `PORT` as required by your host. Set `DATA_DIR` to a persistent writable directory (default `./data`). VAPID keys, device subscriptions, and reminders are generated/saved there. Keep this directory private and backed up; never commit it. No ChatGPT credentials are needed.

## Deploy and use on iPhone

Deploy a **single continuously running Node process**, behind HTTPS, with a persistent volume mounted at `DATA_DIR`. A sleeping/free serverless service is unsuitable for the in-process scheduler. Configure `VAPID_SUBJECT` to a real contact mailto address. The host needs outbound HTTPS to Apple's, Google's, or Mozilla's web push services as appropriate. Keep the VAPID keys across restarts. Hosting costs depend on the provider; no deployment or paid resource has been created.

On iPhone with iOS 16.4+, open the deployed HTTPS site in Safari → Share → Add to Home Screen. Open the installed app, tap Enable notifications, allow permission, then Send a test notification. Add an account nickname and the next reset time shown in ChatGPT. Times are entered in the phone's local timezone, then stored as absolute timestamps. Pause or adjust whenever needed.

Verify real delivery by adding a reminder a few minutes in the future and closing the app. Confirm its notification arrives and the next countdown is five hours later. This device check cannot be completed in a Linux development environment. Focus settings, network connectivity, and operating-system delivery can delay notifications.

## Behavior and limits

- The scheduler checks every 15 seconds. Notifications arriving late do not move the anchor.
- After a server outage, reminders older than 10 minutes are skipped; future cycles remain anchored.
- Reminders and device access tokens are also stored locally. Clearing browser data loses access to local account labels; enabling push again replaces the same device subscription's previous schedule.
- A bearer token protects each device's updates. There is no account login or cross-device synchronization. Subscription data is stored on the server, so use only nicknames rather than sensitive account details.
- This is a personal-use first version. Before public multi-user launch, add authentication, reverse-proxy rate limiting, monitoring, and a database-backed job queue. Run exactly one server instance with the current JSON storage.
- Push providers can occasionally duplicate or delay delivery; this is not an exact alarm service.
- The UI requires network access to load; offline launch is not implemented.

## Validation

`npm test` checks five-hour boundaries, late delivery, and recovery across missed cycles. Local HTTP smoke checks exercise static assets and API validation. Push delivery requires testing from a supported installed browser on the final HTTPS origin.

Account cards support optional email labels and six colors. Active accounts sort by their next reset; paused accounts appear last. Email labels are stored on the device and synced to the same backend storage as reminders. They do not sign into ChatGPT or receive email notifications, and are not included in push notification text. Existing reminders work without these fields.

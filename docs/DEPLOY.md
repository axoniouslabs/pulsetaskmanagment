# Deploying Pulse on Vercel

About 15 minutes. You need a Vercel account and access to this GitHub repo.

## 1. Import the project

1. In Vercel: **Add New → Project → Import** `axoniouslabs/pulsetaskmanagment`.
   If the repo isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to it.
2. Framework: Next.js (detected). Leave the build settings as they are: Vercel runs
   `npm run vercel-build`, which applies database migrations, loads the demo company
   (when `DEMO_MODE=1`) and builds the app.
3. Production branch: `main`. Pushes to `dev` get their own preview links.
4. Click **Deploy**. The first build will say "no DATABASE_URL yet" and still succeed. That's expected.

## 2. Add the database

1. Project → **Storage → Create Database → Neon** (free plan is enough for ~20 people).
   Region: pick the one closest to the team (e.g. Singapore or Frankfurt for Pakistan).
2. Connect it to the project for **Production, Preview and Development**.
   This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.

## 3. Environment variables

Project → **Settings → Environment Variables**. Add these to Production and Preview:

| Name | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `CRON_SECRET` | another long random string |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `npx web-push generate-vapid-keys` (public key) |
| `VAPID_PRIVATE_KEY` | the private key from the same command |
| `VAPID_SUBJECT` | `mailto:you@yourcompany.com` |
| `DEMO_MODE` | `1` for the demo, `0` for a real client |
| `SEED_PASSWORD` | the password every demo account uses |

Optional:

- `BETTER_AUTH_URL`: only once you add a custom domain, e.g. `https://pulse.yourcompany.com`.
- `BLOB_READ_WRITE_TOKEN`: Storage → Create → **Blob** and connect it; uploads then go to Blob instead of Postgres.
- `RESEND_API_KEY` and `EMAIL_FROM`: morning and evening digests by email ([resend.com](https://resend.com), verify your domain).

Then **Deployments → ⋯ → Redeploy**. This build migrates the database and loads the demo company.

## 4. Turn on the reminder engine (every minute)

Vercel's free plan only runs its own cron once a day (already set in `vercel.json` as a safety net),
so use a free external scheduler for the every-minute tick:

1. Sign up at [cron-job.org](https://cron-job.org) (free).
2. Create a cron job:
   - URL: `https://<your-app>.vercel.app/api/cron/tick`
   - Schedule: every 1 minute
   - Advanced → Headers: `Authorization` = `Bearer <your CRON_SECRET>`
3. Save, then press **Test run**. It should answer `{"ok":true,...}`.

Backup scheduler (optional): in GitHub → repo **Settings → Secrets and variables → Actions**, add
`PULSE_URL` (your app URL) and `CRON_SECRET`. The workflow in `.github/workflows/reminder-tick.yml`
then also ticks every 5 minutes.

If the engine stops for more than 10 minutes, the owner sees a red **Reminders are not running** banner.

## 5. Check it

- `https://<your-app>.vercel.app/api/health` should return `"ok": true` once the scheduler runs.
- Sign in at `/login`. With `DEMO_MODE=1`, use the one-tap Owner / Manager / Employee buttons,
  or `firstname@crescent.pk` with your `SEED_PASSWORD`.
- On your phone: sign in, open **Settings → This device → Turn on**, then **Send a test**.
  On iPhone, first add Pulse to the Home Screen (Share → Add to Home Screen) and open it from there.

## 6. Monitoring and backups

- **Uptime:** point a free monitor ([UptimeRobot](https://uptimerobot.com) or Better Stack) at `/api/health`
  every 5 minutes. It returns 503 if the database is down or reminders stopped.
- **Errors:** Vercel → project → **Logs** (filter by "error"); `/api/cron/tick` returns per-company results.
- **Backups:** Neon keeps point-in-time history (free plan: 24 hours; paid plans: up to 30 days).
  To restore: Neon console → **Branches → Restore**. For a weekly copy you keep yourself:
  `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f pulse-$(date +%F).dump`.
- The activity log can't be edited or deleted, even by the app (a database trigger enforces it).

## 7. Moving from the demo to a real client

1. Create a new Neon database (or a new Vercel project) for the client, so demo data never mixes in.
2. Set `DEMO_MODE=0` and redeploy. The database starts empty.
3. Create the client's company and owner account once:

   ```bash
   DATABASE_URL="<client db url>" npm run company:create -- \
     --company "Client Name" --owner-name "Owner Name" --owner-email owner@client.com
   ```

   It prints a temporary password. The owner signs in, then adds departments, teams and people
   from **Organisation** and **Team → Add person**.

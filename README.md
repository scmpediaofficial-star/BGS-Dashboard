# BGS Dashboard

Planning, production and social media command centre for the **Boardroom Governance Summit** — 7 October 2026, Labadi Beach Hotel, Accra.

Next.js 16 · Supabase (Postgres, Auth, Realtime, Storage) · Resend · installable PWA · deploys to Vercel. Everything runs on free tiers.

## What's inside

| Area | What it does |
|---|---|
| **Overview** | Countdown, KPIs, progress by workstream, deadline load, overdue work, open action points, panel/outreach/sponsor status, live activity |
| **Deliverables** | The team's Google Sheet, imported: table + drag-and-drop board, filters, checklists, comments, assignees, CSV export |
| **Panels & speakers · Outreach · Sponsorship · Tickets · Meetings** | Trackers for 42 panelists, 215 invitation letters/embassies, the sponsor pipeline, ticket sales with virtual-access codes, minutes and action points |
| **Social Studio** | Compose once → tailor per network → approve → schedule → publish. LinkedIn, Facebook, Instagram, Threads, X, TikTok, WordPress, Bluesky, Mastodon, Telegram, plus a practice channel for dry runs |
| **Team & roles** | Invitation-only. Super Admin › Admin › Manager › Contributor › Viewer, enforced by Postgres row-level security |
| **Alerts** | Every change writes the audit log, notifies the right people in-app (live), sends a branded Resend email and a push notification. Each person chooses instant / daily briefing / off per category |
| **PWA** | Installable, offline fallback, saves retry automatically when the connection returns, web push, app-icon badge |

## Deploy (about 15 minutes)

1. **Supabase** — create a project. In the SQL editor, run the files in `supabase/migrations/` in numerical order (or `npx supabase link` then `npm run db:push`). They create the schema, security, scheduler and base data.
   > **Planning data is private.** `20260918000003_seed.sql` — the summit's real trackers (invited panelists, sponsor prospects, outreach lists, the 17 Sep minutes) — is deliberately **not** in this repository. It lives only in the project owner's local `supabase/migrations/` folder: run it there, in order (after `…02`, before `…04`). Without it the dashboard still works; the trackers simply start empty.
2. **Vercel** — import this repository. Add the environment variables below. Deploy.
3. **Open the site** — you land on `/setup`. Create the owner account (Super Admin). Setup locks itself as soon as an owner exists.
4. **Settings → Scheduler → Switch on.** One click; this is what publishes scheduled posts every minute and sends the 06:00 briefing. It runs inside Supabase (`pg_cron` + `pg_net`) because Vercel's free plan only allows daily cron.
5. **Team → Invite member** for everyone else. If Resend isn't connected yet the invite link is shown for you to share.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | the publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | the secret / service-role key — server only |
| `NEXT_PUBLIC_SITE_URL` | recommended | e.g. `https://dashboard.boardroomgovsummit.com` (used in emails) |
| `RESEND_API_KEY` | for email | without it, emails are rendered and kept in Settings → Email instead of sent |
| `EMAIL_FROM` | for email | e.g. `BGS Dashboard <alerts@boardroomgovsummit.com>` — the domain must be verified in Resend |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | generate with `npx web-push generate-vapid-keys` |
| `ENCRYPTION_KEY`, `CRON_SECRET` | optional | derived from the service key when absent. Set them (32+ random bytes) if you ever plan to rotate the service key |
| `SETUP_SECRET` | optional | if set, `/setup` asks for it |

The Vercel ⇄ Supabase integration's variable names are also recognised.

## Connecting social channels

Social Studio → **Channels & media**.

- **No developer app needed:** WordPress (application password), Bluesky (app password), Telegram (bot token), Mastodon (access token). Paste, verify, done.
- **Free developer app needed:** LinkedIn, Facebook + Instagram (one Meta app), Threads, X, TikTok. Press *Set up app* — the dashboard shows the exact steps and the redirect URL to paste — then *Connect* signs you in on the network itself. Keys are AES-256-GCM encrypted in Supabase and never shown again.
- Things only the networks control: LinkedIn **company page** posting needs their Community Management API approval (personal profiles work immediately); TikTok posts go to the app's inbox until TikTok audits the app; X decides which API plans may post.
- Use the **Practice channel** to rehearse the whole flow (including a failure: put `[fail]` in the text) without posting anywhere.

## Run locally

```bash
nvm use                 # Node 22+ (supabase-js requires it)
npm install
npm run db:start        # local Supabase in Docker; prints the keys for .env.local
cp .env.example .env.local
npm run dev             # http://localhost:3000 → /setup
```

`npm run typecheck` · `npm run lint` · `npm run build` · `npm run icons` (rebuilds logos and PWA icons from `BGS assets/`, which is not committed).

## How it's put together

`AGENTS.md` is the engineering guide: architecture, conventions and the rules every feature follows (row-level security is the gate, every mutation calls `recordEvent()`, dates are pinned to Accra time). Seed data comes from the planning sheet and the 17 Sep 2026 minutes; corrections made to the sheet's obvious date typos are noted on the items themselves.

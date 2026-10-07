# Croco Creators

The **Croco By Squad** leaderboard: an internal competition for Crocobet employees who post about
work on TikTok, Instagram, Facebook and LinkedIn. Posts must use **#CrocoBySquad** or tag
**@Croco Squad**, an admin approves each one, and approved posts climb two boards:

| Board      | What counts                                           | Score             |
| ---------- | ----------------------------------------------------- | ----------------- |
| **Video**  | TikTok videos, Instagram Reels, Facebook videos       | views + reactions |
| **Static** | LinkedIn posts, Facebook posts, Instagram photo posts | reactions         |

Each board has **This week**, **This month** and the whole **3-Month Challenge**. Admins set the
weekly and monthly rounds (any date ranges) and the challenge dates in the app; past rounds stay
browsable. A post counts in the round it was published in, in Tbilisi time. Metrics refresh
automatically twice a day from the posts' public pages, through [Apify](#automatic-metrics-apify):
no platform accounts are needed.

The frontend and the backend live in this repo: Next.js pages plus Route Handlers under
`/api/v1`, Supabase Postgres (through Drizzle) and Vercel Cron. The API is specified in
[`API_CONTRACT.md`](API_CONTRACT.md).

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui-style components on
Radix · Motion · TanStack Query · React Hook Form + Zod · lucide-react · Better Auth (Microsoft
Entra ID) · Drizzle ORM + postgres.js (Supabase Postgres) · Vercel Cron · Vitest + PGlite ·
ESLint + Prettier

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env   # skip if you already have a .env
npm run dev            # http://localhost:3000
```

Sign-in with Microsoft is always required, so fill in the auth variables first (see
[Authentication](#authentication)). Then pick how the app gets its data:

- **Mock API (no database):** `NEXT_PUBLIC_USE_MOCKS=true`. Everything works in the browser,
  including the admin panel. See [Running with mocks](#running-with-mocks).
- **The real backend:** `NEXT_PUBLIC_USE_MOCKS=false`, `NEXT_PUBLIC_API_BASE_URL=/api/v1` and a
  `DATABASE_URL`. See [Backend](#backend).

## Environment variables

`NEXT_PUBLIC_*` values are compiled into the browser bundle at build time: change them, then
rebuild (or restart `npm run dev`). Everything else is server-only. **Never** put a secret in a
`NEXT_PUBLIC_` variable. On Vercel, set them under **Project → Settings → Environment
Variables** and redeploy.

| Variable                                               | Scope  | Description                                                                                                                                                                              |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_USE_MOCKS`                                | Public | `true` uses the built-in mock API. Anything else calls the real API.                                                                                                                     |
| `NEXT_PUBLIC_API_BASE_URL`                             | Public | `/api/v1` for the backend in this repo. Required when mocks are off.                                                                                                                     |
| `NEXT_PUBLIC_MOCK_ROLE`                                | Public | Mocks only: `admin` or `employee`. Default: `admin` in development, `employee` otherwise.                                                                                                |
| `NEXT_PUBLIC_MOCK_ERROR_RATE`                          | Public | Mocks only: the share of requests that fail on purpose (0 to 1, default 0.05). 0 for demos.                                                                                              |
| `NEXT_PUBLIC_API_SCOPE`                                | Public | **Leave empty** for the backend in this repo. Only for an external API (see [Authentication](#authentication)).                                                                          |
| `BETTER_AUTH_SECRET`                                   | Secret | Encrypts the session cookies. `openssl rand -base64 32`. Changing it signs everyone out.                                                                                                 |
| `BETTER_AUTH_URL`                                      | Server | Public URL of the app, e.g. `https://leaderboard.crocomind.com` (locally `http://localhost:3000`).                                                                                       |
| `AUTH_MICROSOFT_TENANT_ID`, `AUTH_MICROSOFT_CLIENT_ID` | Server | The app registration's Directory (tenant) ID and Application (client) ID.                                                                                                                |
| `AUTH_MICROSOFT_CLIENT_SECRET`                         | Secret | The app registration's client secret value.                                                                                                                                              |
| `AUTH_ALLOWED_EMAIL_DOMAINS`                           | Server | Who may sign in, comma-separated. Default `crocobet.com`.                                                                                                                                |
| `DATABASE_URL`                                         | Secret | Supabase Postgres, **transaction pooler** (port 6543).                                                                                                                                   |
| `MIGRATIONS_DATABASE_URL`                              | Secret | Migrations only: the session pooler or direct connection (port 5432). Falls back to `DATABASE_URL`.                                                                                      |
| `CRON_SECRET`                                          | Secret | Vercel Cron sends it as a Bearer token; the cron route answers 401 without it. At least 16 characters.                                                                                   |
| `POST_DATA_PROVIDER`, `POST_DATA_PROVIDER_<PLATFORM>`  | Server | `apify`, `fixture` or `manual` (per platform: `_INSTAGRAM`, `_FACEBOOK`, `_TIKTOK`, `_LINKEDIN`). Default `fixture`; `manual` on Vercel production.                                      |
| `APIFY_API_TOKEN`                                      | Secret | Apify personal API token, for `POST_DATA_PROVIDER=apify`. Without it, `apify` falls back to manual entry.                                                                                |
| `APIFY_MAX_CHARGE_USD`                                 | Server | Cost cap per scraper run, in US dollars. Default 1.                                                                                                                                      |
| `APIFY_ACTOR_<PLATFORM>`                               | Server | Optional: another Apify scraper for a platform (`username~actor-name`). See [Automatic metrics](#automatic-metrics-apify).                                                               |
| `ADMIN_EMAILS`                                         | Server | Admins, comma-separated. Default: `tekizashvili@crocobet.com`, `gbedoshvili@crocobet.com`. Setting it replaces the list.                                                                 |
| `CHALLENGE_STARTS_AT`, `CHALLENGE_ENDS_AT`             | Server | The challenge until an admin sets its dates in the app (which wins): ISO date-times with an offset, e.g. `2026-10-06T00:00:00+04:00`. End exclusive.                                     |
| `CAMPAIGN_TIMEZONE`                                    | Server | Default `Asia/Tbilisi`. Weeks and months are computed in it.                                                                                                                             |
| `CAMPAIGN_HASHTAGS`                                    | Server | Default `CrocoBySquad`.                                                                                                                                                                  |
| `CAMPAIGN_MENTIONS`                                    | Server | Optional. Empty: the real Croco Squad accounts (`@croco.squad` on Instagram, "Croco Squad" on TikTok and Facebook, "crocobet.com \| Croco Squad" on LinkedIn). `none`: the hashtag only. |
| `SUBMISSION_GRACE_DAYS`, `METRICS_GRACE_DAYS`          | Server | Days after the challenge that submissions and metric refreshes continue. Default 3 each.                                                                                                 |
| `GROWTH_FLAG_FACTOR`, `GROWTH_FLAG_MIN`                | Server | The `suspicious_growth` flag: growth between two snapshots above both (default ×5 and 1,000).                                                                                            |
| `SUPABASE_*`                                           | Secret | Reserved. The backend talks to Postgres directly and doesn't use the Supabase API keys.                                                                                                  |

The server validates its variables on first use ([`lib/server/config.ts`](lib/server/config.ts))
and fails with a clear message when one is invalid.

## Scripts

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                            |
| `npm run build`        | Production build (also type-checks)                             |
| `npm start`            | Serve the production build                                      |
| `npm run lint`         | ESLint (Next.js, React Hooks/Compiler, TS rules)                |
| `npm run typecheck`    | `tsc --noEmit`                                                  |
| `npm test`             | Vitest: unit tests and database tests (PGlite, no Docker)       |
| `npm run format`       | Prettier (sorts Tailwind classes too)                           |
| `npm run format:check` | Prettier check, for CI                                          |
| `npm run db:generate`  | Generate a migration in `drizzle/` after changing the schema    |
| `npm run db:migrate`   | Apply the migrations (`MIGRATIONS_DATABASE_URL`/`DATABASE_URL`) |

## Running with mocks

The mock backend ([`lib/api/mock/`](lib/api/mock/)) implements the whole API in the browser,
with the same rules as the server (it uses the same pure modules). It generates a challenge that
started six weeks ago, 25 employees and about 140 posts of every content type, status, check
result and flag, plus two weeks of twice-daily syncs. You still sign in with Microsoft; the mock
`/me` then treats you as Tamar Lomidze, an admin unless `NEXT_PUBLIC_MOCK_ROLE=employee`.

Requests take 300 to 800 ms and about 5% fail (`NEXT_PUBLIC_MOCK_ERROR_RATE`). Your changes
(submissions, moderation, edits) are saved in `localStorage` under `croco-creators.mock-state`
and regenerated after three days; clear that key to start over.

## How the app works

- **One route, client-side views.** Everything is on `/`. The view and filters live in the URL
  (`?view=my-posts`, `?category=static&platform=linkedin&period=week&q=nino`, `?view=admin`), so
  links are shareable and survive a refresh. Views use `history.pushState`, filters use
  `replaceState`. Old links (`?view=my-videos`, `?metric=…`) still open. See
  [`lib/url-state.ts`](lib/url-state.ts).
- **Data.** Components call TanStack Query hooks in [`lib/api/queries.ts`](lib/api/queries.ts).
  Those call [`lib/api/index.ts`](lib/api/index.ts), which picks the mock or HTTP adapter; both
  implement `ApiAdapter` from [`lib/api/types.ts`](lib/api/types.ts). The mock adapter and the
  admin panel are loaded on demand.
- **Shared rules.** The pure modules in `lib/` decide everything that must match between the mock
  and the server, and are unit-tested:
  [`platforms`](lib/platforms.ts) (link patterns, content types, boards),
  [`scoring`](lib/scoring.ts), [`periods`](lib/periods.ts) (Tbilisi weeks and months, the
  challenge window), [`campaign-tag`](lib/campaign-tag.ts), [`ranking`](lib/ranking.ts),
  [`moderation`](lib/moderation.ts) (the state machine), [`post-check`](lib/post-check.ts) (a
  provider fetch becomes the check, flags, reclassification, publish date and metrics) and
  [`post-ids`](lib/post-ids.ts) (publish times from TikTok and LinkedIn post IDs).
- **Rounds.** Admins add weekly and monthly rounds with any dates under **Admin → Leaderboards**
  (or generate 7-day weeks from the challenge start and calendar months in one click), and set the
  challenge dates there. "This week" and "This month" show the round that's on now (between
  rounds: the next one before the first starts, otherwise the last one); past rounds are in the
  period menu. Without rounds of a kind, the board uses calendar weeks or months. Rounds of a kind
  can't overlap and must fall inside the challenge. See [`rounds`](lib/rounds.ts).
- **Moderation.** Admins approve every post; the automated check (tag, author account, inside the
  window) is evidence, never an automatic approval. Only approved posts count. Admins can
  disqualify approved posts at any time; every admin action is audited.

## Backend

```
app/api/v1/**/route.ts             thin handlers: parse (Zod) → service → JSON
app/api/cron/refresh-metrics/      the twice-daily refresh (Vercel Cron)
lib/server/config.ts               validated server configuration
lib/server/db/{schema,client}.ts   Drizzle schema and the Postgres client
lib/server/auth.ts                 requireEmployee() / requireAdmin()
lib/server/http.ts, route.ts       error envelope, input parsing, same-origin check
lib/server/services/               leaderboard, rounds, posts, checks, sync, admin, employees, profile
lib/server/providers/              PostDataProvider: apify, fixture, manual
lib/server/link-resolver.ts        short-link resolution with an SSRF guard
drizzle/                           SQL migrations
```

Every module under `lib/server/` starts with `import "server-only"`. Every `/api/v1` handler
checks the session itself (on top of `proxy.ts`), admin handlers also check the role (403), and
`POST`/`PATCH`/`DELETE` must come from the app's own origin. Limits are counted in the database:
20 submissions per employee per day, one re-check per post per 10 minutes, one manual sync per
15 minutes.

**Database connections on Vercel.** Vercel pauses a function instance between requests, and a
connection left open while it's paused can die unnoticed; the next query on it would hang until the
function is killed (300 s). So connections close after 5 idle seconds and the instance stays up
until they have ([`lib/server/db/client.ts`](lib/server/db/client.ts), the same idea as Vercel's
`attachDatabasePool`, which only supports `pg`). As a safety net, a read that takes over 20
seconds answers 503 and reopens the connections; the browser retries once.

### Database setup

The Supabase database starts empty. **Migrations** are the SQL files in [`drizzle/`](drizzle/)
that create the app's tables (employees, posts, snapshots, rounds, …), their constraints and
indexes, and lock them down. `npm run db:migrate` applies the ones the database hasn't had yet
and records them in a `drizzle.__drizzle_migrations` table, so running it again is safe. It has
to run once before the first deploy that uses the database, and again whenever a new file appears
in `drizzle/` (this release adds `0001_rounds_and_challenge.sql`). Without it, the API answers
`500` because the tables it queries don't exist.

1. In Supabase: **Project → Connect**. Copy the **Transaction pooler** URI (port 6543) into
   `DATABASE_URL` and the **Session pooler** URI (port 5432) into `MIGRATIONS_DATABASE_URL`.
2. Run the migrations: `npm run db:migrate`. They create the tables and turn on **row-level
   security with no policies**, so Supabase's public API (PostgREST) can't read or write
   anything; only the server, connecting as the database role, can.
3. After changing [`lib/server/db/schema.ts`](lib/server/db/schema.ts): `npm run db:generate`,
   review the SQL in `drizzle/`, commit it, then `npm run db:migrate`.

For local development, any Postgres works, for example
`docker run -d -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=dev postgres:17-alpine` with
`DATABASE_URL=postgres://postgres:dev@127.0.0.1:5432/postgres`. The tests don't need one: they
run the real migrations in PGlite (Postgres in WebAssembly).

### Admins

Admins see the **Admin** view (`?view=admin`): the review queue and **Leaderboards** (rounds and
challenge dates). The admins are `tekizashvili@crocobet.com` and `gbedoshvili@crocobet.com` by
default. `ADMIN_EMAILS` replaces that list (redeploy to apply); or, in SQL, once someone has
signed in:

```sql
update employees set role = 'admin' where email = 'name@crocobet.com';
```

### Where post data comes from

Submissions are stored as `pending` right away, then checked after the response: the post's
provider fetches it, and the result is applied with the shared rules (tag, author account,
publish window, reclassification of "photo" links that are really videos, metrics and a
snapshot). Short links (`vm.tiktok.com`, `fb.watch`, `…/share/…`) are resolved first.

| `POST_DATA_PROVIDER` | Behavior                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `apify`              | Automatic: Apify's scrapers read each post's public page (see below).                         |
| `fixture`            | Deterministic fake data from a hash of the link. For development and previews only.           |
| `manual`             | No automatic data: admins enter views and reactions in the review drawer (and can lock them). |

Any platform can use its own provider, e.g. `POST_DATA_PROVIDER_LINKEDIN=manual`. Admins can
always correct and lock numbers by hand. Another vendor plugs in the same way: implement
`PostDataProvider` ([`lib/server/providers/types.ts`](lib/server/providers/types.ts)) and register
its id in [`lib/server/providers/index.ts`](lib/server/providers/index.ts).

### Automatic metrics (Apify)

TikTok, Instagram, Facebook and LinkedIn don't let an app read other people's post numbers without
each owner connecting their account. [Apify](https://apify.com) runs scrapers that read the public
post page instead: views, reactions, caption, hashtags, mentions, author and publish date. Nobody
needs a platform account or a Croco Squad page; employees just submit their links. Posts must be
public.

| Platform  | Scraper (default)                                                                          | Price per 1,000 posts (Free plan / Starter) |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| TikTok    | [`clockworks~tiktok-video-scraper`](https://apify.com/clockworks/tiktok-video-scraper)     | $3.00 / $2.00                               |
| Instagram | [`apify~instagram-scraper`](https://apify.com/apify/instagram-scraper)                     | $2.70 / $2.30                               |
| Facebook  | [`apify~facebook-posts-scraper`](https://apify.com/apify/facebook-posts-scraper)           | $5.00 / $4.00                               |
| LinkedIn  | [`harvestapi~linkedin-profile-posts`](https://apify.com/harvestapi/linkedin-profile-posts) | $2.00                                       |

Setup:

1. Create an account at [apify.com](https://apify.com) (a Crocobet email; a card is needed for a
   paid plan).
2. **Settings → API & Integrations → Personal API tokens**: copy the token into
   `APIFY_API_TOKEN` (Vercel, Production, marked sensitive). It never reaches the browser.
3. Set `POST_DATA_PROVIDER=apify` and redeploy. The next submission is checked through Apify.

**Cost.** Each post is fetched when it's submitted, on each re-check, and twice a day while it's
active, so a month costs about _posts × 60 × price_. 100 active posts at ~$3 per 1,000 is about
$18 a month. The Free plan's $5 of monthly usage covers roughly 25 posts; the **Starter** plan
($19 a month of usage included, extra billed as used) fits about 100. Every run carries a
`maxTotalChargeUsd` cap (`APIFY_MAX_CHARGE_USD`), and Apify's billing settings can also set a
monthly usage limit. Prices are Apify's, checked October 2026.

**How it runs.** Posts are grouped by platform, 50 links per scraper run, and the four platforms
run at once with memory that fits the free plan (8 GB). A run that fails (Apify down, out of
credit, rate limit) is the provider's fault: it never counts toward a post being `unavailable`,
and the posts are tried again on the next refresh. A post missing from a successful run counts as
not found. The field mapping per scraper is in
[`lib/server/providers/apify/mapping.ts`](lib/server/providers/apify/mapping.ts), tested against
sample payloads in `__fixtures__/` (replace them with real ones after the first runs). If a
scraper stops working, switch it with `APIFY_ACTOR_<PLATFORM>` (the mapping must match its
output), or set that platform to `manual`.

### Twice-daily refresh (Vercel Cron)

[`vercel.json`](vercel.json) calls `GET /api/cron/refresh-metrics` at 08:00 and 19:59 UTC
(12:00 and 23:59 in Tbilisi, which has no daylight saving time). Set `CRON_SECRET` in Vercel; Vercel sends it as
`Authorization: Bearer …`, and the route answers 401 without it. Cron jobs run on production
deployments only. Admins can also press **Refresh now**.

Each run refreshes active posts (pending or approved, inside the challenge or not yet dated, until
`METRICS_GRACE_DAYS` after the end), oldest fetch first, skipping posts fetched in the last 6
hours (except "Refresh now"). It stores a snapshot per fetch, re-runs the tag check, keeps the
last values when a fetch fails (three failures in a row flag the post `unavailable`), keeps locked
numbers and raises `tag_removed`, `suspicious_growth` and other flags for the admins. It stops
starting new batches before the function's time limit (`maxDuration` 300 s), and Apify runs are
shortened to finish before it; the next run continues, oldest first. Runs never overlap: Supabase's transaction pooler can't hold a
session-level advisory lock, so a run is claimed with `pg_try_advisory_xact_lock` plus its
unfinished `sync_runs` row (a crashed run stops blocking after 15 minutes).

## Deploying (checklist)

1. **Azure:** the app registration has the production redirect URI and Microsoft Graph
   **User.Read** (see [Azure setup](#azure-setup-one-time)).
2. **Supabase:** run `npm run db:migrate` against the production database (from your machine,
   with `MIGRATIONS_DATABASE_URL` set to the session pooler URI). See
   [Database setup](#database-setup) for what it does.
3. **Vercel env vars (Production):** everything in the table above that applies. In particular:
   `NEXT_PUBLIC_USE_MOCKS=false`, `NEXT_PUBLIC_API_BASE_URL=/api/v1`, `NEXT_PUBLIC_API_SCOPE`
   empty, `DATABASE_URL`, `CRON_SECRET`, `POST_DATA_PROVIDER=apify` and `APIFY_API_TOKEN`.
   `ADMIN_EMAILS`, `CAMPAIGN_MENTIONS` and the challenge dates have working defaults.
4. **Deploy**, sign in as an admin, open **Admin → Leaderboards**: set the challenge dates and
   add (or generate) the weekly and monthly rounds. Then submit a test post and check that the
   sync panel shows a run after the next cron time (or press **Refresh now**).

## Design system and branding

- **Colors and effects:** [`styles/tokens.css`](styles/tokens.css) is the only file with color
  values. Swap in the official brand values there, for both `:root`/`.dark` (default) and
  `.light`. [`app/globals.css`](app/globals.css) maps the tokens to Tailwind names
  (`bg-surface`, `text-brand-text`, `shadow-glow`, ...) and also to the standard shadcn/ui names,
  so components added later with `npx shadcn add` match automatically.
- **Radii:** `rounded-control` (16px, inputs and buttons), `rounded-card` (24px) and
  `rounded-panel` (32px, modals and podium cards). They're defined in `app/globals.css`.
- **Logo:** [`components/layout/logo.tsx`](components/layout/logo.tsx), an inline SVG: the mark
  (a white "C" inside a green one, also the favicon in `app/icon.svg`) and "Croco Creators" in Inter
  ExtraBold as outlines. Its colors come from the tokens, so it follows the theme. Clicking it in
  the header opens the leaderboard with every filter reset.
- **Fonts:** Inter, loaded with `next/font`. Georgian characters in what employees write (post
  titles and captions) fall back to Noto Sans Georgian, which only downloads when such text is on
  screen.
- **Charts** are small inline SVGs (no chart library).

## Motion

All motion values live in two mirrored places. Change them there and the whole app follows:

- [`lib/motion.ts`](lib/motion.ts) (JS, for Motion animations): easing curves (`EASE_OUT_SOFT`,
  `EASE_IN_OUT_SOFT`), durations (`DURATION.fast/base/slow`), springs (`springSoft` for hover
  lifts and cards, `springPress` for button presses, `springLayout` for reordering and sliding
  indicators, `springGentle` for modals, sheets and the podium), plus the hover-out factor,
  exit factor, lift and press amounts, tilt angle and stagger.
- [`app/globals.css`](app/globals.css) (CSS): the same curves and durations as
  `--ease-out-soft`, `--ease-in-out-soft`, `--dur-fast/base/slow` and `--hover-out`, and the
  utilities built on them: `motion-colors`, `motion-press`, `motion-lift`, `hover-lift`,
  `press`, `card-depth`, `card-spotlight` and `field-glow`.

Rules the code follows:

- Only `transform` and `opacity` animate. Shadows and glows are pseudo-element layers whose
  opacity fades.
- Hover effects run only on `(hover: hover) and (pointer: fine)`, because the `hover:` variant
  is redefined that way. Touch keeps the press feedback.
- With `prefers-reduced-motion`, movement, scaling, tilt, springs, sheen, spotlight, breathing
  glow and confetti turn off. What's left is about 150ms opacity fades.
- Buttons are [`components/ui/motion-button.tsx`](components/ui/motion-button.tsx)
  (`MotionButton` / `MotionLinkButton`).

## UI text

The app is in English only. All UI strings are in
[`lib/i18n/dictionaries.ts`](lib/i18n/dictionaries.ts), and numbers, dates and relative times are
formatted in [`lib/i18n/format.ts`](lib/i18n/format.ts); components read both through
`useI18n()`.

## Authentication

Only Crocobet employees can use the app. Every page needs a Microsoft sign-in with an
`@crocobet.com` account. It's built on [Better Auth](https://better-auth.com) with its Microsoft
Entra ID provider (OpenID Connect, authorization code flow with PKCE and a client secret).

### How access is restricted

1. **Single-tenant app registration.** Only accounts in the Crocobet directory can authenticate
   with Microsoft at all.
2. **Token checks on every sign-in** ([`lib/auth/policy.ts`](lib/auth/policy.ts)): the ID token
   must come from the Crocobet tenant (`tid`, `iss`) and be for this app (`aud`). The account's
   email (or sign-in name if there's no email claim) must be at an allowed domain. B2B guests are
   rejected even though they're in the directory.
3. **Checks on every request:** [`proxy.ts`](proxy.ts) redirects signed-out visitors to
   `/sign-in` (keeping their link) and answers API calls with 401. The page and every API handler
   re-check the session on the server. `/api/cron` checks its own secret instead.

Rejected sign-ins return to `/sign-in` with a clear message ("That isn't a Crocobet work
account…", "That account belongs to another organization…").

### Azure setup (one time)

In the [Microsoft Entra admin center](https://entra.microsoft.com):

1. **Identity → Applications → App registrations → New registration**
   - Name: `Croco Creators`
   - Supported account types: **Accounts in this organizational directory only (single tenant)**
   - Redirect URI: platform **Web**, `http://localhost:3000/api/auth/callback/microsoft`
2. **Authentication → Add URI:** `https://leaderboard.crocomind.com/api/auth/callback/microsoft`.
   Leave the "ID tokens" and "Access tokens" (implicit grant) boxes **unchecked**.
3. **Certificates & secrets → New client secret.** Copy the **Value** (shown once) into
   `AUTH_MICROSOFT_CLIENT_SECRET`. Note the expiry date; sign-in stops working when it expires.
4. **Overview:** copy **Application (client) ID** into `AUTH_MICROSOFT_CLIENT_ID` and **Directory
   (tenant) ID** into `AUTH_MICROSOFT_TENANT_ID`.
5. **Token configuration → Add optional claim → ID → `email`** (recommended).
6. **API permissions:** Microsoft Graph, **Delegated**: `openid`, `profile`, `email`,
   `offline_access` and **`User.Read`**. These don't need admin consent: each employee accepts
   them on first sign-in. **Grant admin consent for Crocobet** is optional and skips that prompt
   for everyone (it's needed only if the tenant blocks user consent). With `User.Read`, at sign-in the app copies each employee's first and last name, department and
   profile photo from Microsoft Graph (at most once a week; photos stay behind sign-in). Without
   it, sign-in still works, but the board shows display names and initials only.
7. _Optional:_ to allow only some employees, open **Enterprise applications → Croco Creators →
   Properties**, set **Assignment required** to Yes, and assign users or groups.

Then fill the variables in `.env` (local) and in **Vercel → Settings → Environment
Variables** (set `BETTER_AUTH_URL=https://leaderboard.crocomind.com`), and redeploy.

Things to know:

- **Preview deployments can't sign in.** Entra doesn't allow wildcard redirect URIs; add a
  preview's exact URL if you need one. Also redirect the `*.vercel.app` domain to
  `leaderboard.crocomind.com` (Vercel → Domains), because a sign-in started on one domain
  can't finish on another.
- **Sessions** last 12 hours, then the user signs in again (usually one click, thanks to
  Microsoft SSO). Signing out ends the app session; Microsoft then shows its account picker.
- **Sessions don't use the database.** The session and the Microsoft tokens are stored in
  encrypted (JWE), `httpOnly`, `SameSite=Lax` cookies split across several cookies. The API keys
  employees on the Entra object ID (`oid`), which rides in that cookie. The trade-off: a session
  can't be revoked server-side, so an employee whose account is disabled keeps access until their
  session expires (at most 12 hours).
- **Rotate the secrets** in Azure and Vercel together. Changing `BETTER_AUTH_SECRET` signs
  everyone out.
- **External API (optional).** The backend in this repo uses the session cookie, so
  `NEXT_PUBLIC_API_SCOPE` stays empty. Only for a separate API: set it to that API's scope (Expose
  an API, e.g. `api://<client-id>/access_as_user`); `getAuthHeaders()` in
  [`lib/api/http-client.ts`](lib/api/http-client.ts) then sends `Authorization: Bearer …`. An
  access token covers one resource, so sign-in then asks for that scope instead of `User.Read`.

### Where the code is

| File                                                                                               | What it does                                                     |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`lib/auth/server.ts`](lib/auth/server.ts)                                                         | Better Auth setup: Entra provider, session, identity checks      |
| [`lib/auth/policy.ts`](lib/auth/policy.ts)                                                         | Who may sign in (tenant, domains), safe redirects; tested        |
| [`lib/auth/config.ts`](lib/auth/config.ts)                                                         | Reads and validates the auth variables                           |
| [`lib/auth/session.ts`](lib/auth/session.ts)                                                       | `getSessionUser()` for server components                         |
| [`lib/server/auth.ts`](lib/server/auth.ts)                                                         | `requireEmployee()` / `requireAdmin()` for API handlers          |
| [`lib/server/services/profile.ts`](lib/server/services/profile.ts)                                 | Name, department and photo from Microsoft Graph, after sign-in   |
| [`lib/auth/client.ts`](lib/auth/client.ts)                                                         | Sign in / sign out from the browser                              |
| [`proxy.ts`](proxy.ts)                                                                             | Protects every page and API route                                |
| [`app/sign-in/page.tsx`](app/sign-in/page.tsx), [`components/auth/`](components/auth/)             | The sign-in page                                                 |
| [`app/api/auth/[...all]/route.ts`](app/api/auth/[...all]/route.ts)                                 | Auth endpoints (`/api/auth/callback/microsoft`, ...)             |
| [`components/providers/current-user-provider.tsx`](components/providers/current-user-provider.tsx) | `useCurrentUser()`: session identity + `GET /me` (with the role) |

## Testing

- `npm test` runs the unit tests for every pure module and the database tests: PGlite with the
  real migrations, covering submissions, duplicates across link variants, the challenge window,
  every moderation action and its audit row, the sync job (snapshots, failures, flags, locks),
  the cron route's 401, admin routes' 403, and the server leaderboard matching `rankBoard()` on
  the same data.
- The browser QA helpers from development live outside the repo (a mock Entra server and
  Playwright scripts).

## Project structure

```
app/                      layout, the single page, error boundary
  api/v1/                 the API (see API_CONTRACT.md)
  api/cron/               the twice-daily refresh
components/
  app-shell.tsx           header + current view + submit dialog
  layout/                 header, logo slot, view nav, user menu (with the theme), mobile FAB
  leaderboard/            toolbar, podium, ranked list, side sheet, pinned "my position" bar
  my-posts/               summary cards, post cards, empty state
  submit/                 submit dialog, form, URL field, preview, success + confetti
  admin/                  the admin panel: queue, review drawer, moderation, sync, export
  common/                 avatars, platform badges, animated numbers, state panels, thumbnails
  providers/              app providers, i18n, current user
  ui/                     design-system primitives (button, input, dialog/sheet, menus, ...)
  auth/                   sign-in screen
  icons/                  platform brand icons, Microsoft logo
lib/
  api/                    types, HTTP client + adapter, mock backend, TanStack Query hooks
  auth/                   Microsoft sign-in (Better Auth), access policy, session helpers
  server/                 the backend: config, database, services, providers, link resolver
  i18n/                   UI strings and formatting
  validation/             Zod schemas
  hooks/                  URL state, media queries, viewport tracking, ...
  *.ts                    shared rules: platforms, scoring, periods, ranking, moderation, ...
drizzle/                  SQL migrations
styles/tokens.css         design tokens (colors, shadows)
test/                     PGlite helper and factories for the database tests
proxy.ts                  route protection (sign-in required)
vercel.json               cron schedule
```

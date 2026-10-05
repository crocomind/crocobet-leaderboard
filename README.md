# Croco Creators

An internal leaderboard competition for Crocobet employees who post videos on Instagram,
Facebook, TikTok and LinkedIn. The employee whose videos collect the most views and reactions
wins.

This repository is the frontend. The backend isn't built yet, so the app runs against a typed
mock API until it is. See [`API_CONTRACT.md`](API_CONTRACT.md) for what the backend needs to
provide.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui-style components on
Radix · Motion (Framer Motion) · TanStack Query · React Hook Form + Zod · lucide-react ·
Better Auth (Microsoft Entra ID) · Vitest · ESLint + Prettier

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env   # skip if you already have a .env
npm run dev            # http://localhost:3000
```

Sign-in with Microsoft is required, so fill in the auth variables first (see
[Authentication](#authentication)). Until they're set, the app shows "Sign-in isn't set up yet".
With `NEXT_PUBLIC_USE_MOCKS=true` (the default in `.env.example`) no backend is needed.

## Environment variables

| Variable                       | Used by  | Description                                                                                                                    |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_USE_MOCKS`        | Frontend | `true` uses the built-in mock API. Anything else calls the real API.                                                           |
| `NEXT_PUBLIC_API_BASE_URL`     | Frontend | Backend base URL, e.g. `https://api.example.com`. Required when mocks are off.                                                 |
| `NEXT_PUBLIC_MOCK_ERROR_RATE`  | Frontend | Mocks only: the share of requests that fail on purpose (0 to 1, default 0.05). Use 0 for demos and 1 to see every error state. |
| `BETTER_AUTH_SECRET`           | Server   | **Secret.** Encrypts the session cookies. Generate with `openssl rand -base64 32`.                                             |
| `BETTER_AUTH_URL`              | Server   | Public URL of the app, e.g. `https://leaderboard.crocomind.com` (locally `http://localhost:3000`).                             |
| `AUTH_MICROSOFT_TENANT_ID`     | Server   | Crocobet's Directory (tenant) ID, a GUID.                                                                                      |
| `AUTH_MICROSOFT_CLIENT_ID`     | Server   | The app registration's Application (client) ID.                                                                                |
| `AUTH_MICROSOFT_CLIENT_SECRET` | Server   | **Secret.** The app registration's client secret value.                                                                        |
| `AUTH_ALLOWED_EMAIL_DOMAINS`   | Server   | Who may sign in, comma-separated. Default `crocobet.com`.                                                                      |
| `NEXT_PUBLIC_API_SCOPE`        | Both     | Optional backend API scope, e.g. `api://<api-client-id>/access_as_user`. When set, API calls carry the user's access token.    |
| `SUPABASE_*`                   | Backend  | Reserved for the backend. The frontend doesn't read them. Never prefix them with `NEXT_PUBLIC_`.                               |

`NEXT_PUBLIC_*` values are compiled into the browser bundle when you build. Change them, then
rebuild (or restart `npm run dev`). On Vercel, set them under **Project → Settings →
Environment Variables** and redeploy.

## Scripts

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Start the dev server                             |
| `npm run build`        | Production build (also type-checks)              |
| `npm start`            | Serve the production build                       |
| `npm run lint`         | ESLint (Next.js, React Hooks/Compiler, TS rules) |
| `npm run typecheck`    | `tsc --noEmit`                                   |
| `npm test`             | Vitest unit tests                                |
| `npm run format`       | Prettier (sorts Tailwind classes too)            |
| `npm run format:check` | Prettier check, for CI                           |

## Running with mocks

The mock backend ([`lib/api/mock/`](lib/api/mock/)) generates 25 employees with about 120 videos
spread across the four platforms. The data is seeded, so it's the same on every load. Requests
take 350 to 900 ms, and about 5% fail so you can see error states. You still sign in with
Microsoft; the mock `/me` then treats you as Tamar Lomidze, who is #14 in the default view. That shows the pinned "You're #14 · … behind #13"
bar.

Videos you submit in mock mode are saved in your browser's `localStorage`
(`croco-creators.mock-submissions`). Clear that key to start over.

## How the app works

- **One route, client-side views.** Everything is on `/`. The view and filters live in the URL
  (`?view=my-videos`, `?metric=reactions&platform=tiktok&period=week&q=nino`), so links are
  shareable and survive a refresh. Switching views uses `history.pushState`, so Back works,
  while filters use `replaceState`. There's no server round trip. See
  [`lib/url-state.ts`](lib/url-state.ts).
- **Data.** Components call TanStack Query hooks in [`lib/api/queries.ts`](lib/api/queries.ts).
  Those call [`lib/api/index.ts`](lib/api/index.ts), which picks the mock or HTTP adapter. Both
  implement `ApiAdapter` from [`lib/api/types.ts`](lib/api/types.ts). The mock adapter is loaded
  lazily, so a production build with mocks off doesn't ship mock data.
- **Platforms.** Every platform detail lives in [`lib/platforms.ts`](lib/platforms.ts): id,
  name, icon, badge color, hostnames and the accepted link patterns. To add or remove a
  platform, edit `PLATFORM_IDS` and `PLATFORMS` there. TypeScript then points to the remaining
  places (the mock data generator).
- **Validation.** [`lib/validation/submit-video.ts`](lib/validation/submit-video.ts) is the Zod
  schema. It returns error _codes_, which the UI translates.

## Design system and branding

- **Colors and effects:** [`styles/tokens.css`](styles/tokens.css) is the only file with color
  values. Swap in the official brand values there, for both `:root`/`.dark` (default) and
  `.light`. [`app/globals.css`](app/globals.css) maps the tokens to Tailwind names
  (`bg-surface`, `text-brand-text`, `shadow-glow`, ...) and also to the standard shadcn/ui names,
  so components added later with `npx shadcn add` match automatically.
- **Radii:** `rounded-control` (16px, inputs and buttons), `rounded-card` (24px) and
  `rounded-panel` (32px, modals and podium cards). They're defined in `app/globals.css`.
- **Logo:** put the official logo at `public/logo.svg` and the header uses it. Until then it
  shows the text "Croco Creators", and the browser console logs a 404 for `/logo.svg`.
- **Fonts:** Inter for Latin and Noto Sans Georgian for Georgian, loaded with `next/font`.
- **Motion:** see [Motion](#motion).

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

## Translations

All UI strings are in [`lib/i18n/dictionaries.ts`](lib/i18n/dictionaries.ts), with English
(`en`) and Georgian (`ka`). TypeScript makes sure both have the same keys. The chosen language
is saved in a `locale` cookie, so the server renders the right language without a flash. Before
anyone picks one, the browser's language decides. Georgian numbers, dates and relative times are
formatted in [`lib/i18n/format.ts`](lib/i18n/format.ts) rather than with `Intl`, because Chrome
ships without Georgian `Intl` data.

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
   `/sign-in` (keeping their link) and answers API calls with 401. The page also re-checks the
   session on the server.

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
6. **API permissions:** keep Microsoft Graph `openid`, `profile`, `email`, `offline_access`, then
   **Grant admin consent for Crocobet** so employees don't see a consent prompt.
7. _Optional:_ to allow only some employees, open **Enterprise applications → Croco Creators →
   Properties**, set **Assignment required** to Yes, and assign users or groups.
8. _Optional, when the backend exists:_ **Expose an API → add a scope** (e.g. `access_as_user`)
   and put its full name (`api://<client-id>/access_as_user`) in `NEXT_PUBLIC_API_SCOPE`.

Then fill the variables in `.env` (local) and in **Vercel → Settings → Environment
Variables** (set `BETTER_AUTH_URL=https://leaderboard.crocomind.com`), and redeploy.

Things to know:

- **Preview deployments can't sign in.** Entra doesn't allow wildcard redirect URIs; add a
  preview's exact URL if you need one. Also redirect the `*.vercel.app` domain to
  `leaderboard.crocomind.com` (Vercel → Domains), because a sign-in started on one domain
  can't finish on another.
- **Sessions** last 12 hours, then the user signs in again (usually one click, thanks to
  Microsoft SSO). Signing out ends the app session; Microsoft then shows its account picker.
- **No database is used.** The session and the Microsoft tokens are stored in encrypted (JWE),
  `httpOnly`, `SameSite=Lax` cookies, about 9 KB split across several cookies. The trade-off: a
  session can't be revoked server-side, so an employee whose account is disabled keeps access
  until their session expires (at most 12 hours). For instant revocation, give Better Auth a
  database (e.g. Supabase Postgres) once the backend exists.
- **Rotate the secrets** in Azure and Vercel together. Changing `BETTER_AUTH_SECRET` signs
  everyone out.

### Calling the backend

With `NEXT_PUBLIC_API_SCOPE` set, `getAuthHeaders()` in
[`lib/api/http-client.ts`](lib/api/http-client.ts) adds
`Authorization: Bearer <Microsoft access token>` to every API request. Better Auth refreshes the
token when it expires. A 401 from the API sends the user to sign in again. See
[`API_CONTRACT.md`](API_CONTRACT.md#authentication) for how the backend should validate it.

### Where the code is

| File                                                                                               | What it does                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`lib/auth/server.ts`](lib/auth/server.ts)                                                         | Better Auth setup: Entra provider, session, identity checks |
| [`lib/auth/policy.ts`](lib/auth/policy.ts)                                                         | Who may sign in (tenant, domains), safe redirects; tested   |
| [`lib/auth/config.ts`](lib/auth/config.ts)                                                         | Reads and validates the environment variables               |
| [`lib/auth/session.ts`](lib/auth/session.ts)                                                       | `getSessionUser()` for server components                    |
| [`lib/auth/client.ts`](lib/auth/client.ts)                                                         | Sign in / sign out from the browser                         |
| [`proxy.ts`](proxy.ts)                                                                             | Protects every page and API route                           |
| [`app/sign-in/page.tsx`](app/sign-in/page.tsx), [`components/auth/`](components/auth/)             | The sign-in page                                            |
| [`app/api/auth/[...all]/route.ts`](app/api/auth/[...all]/route.ts)                                 | Auth endpoints (`/api/auth/callback/microsoft`, ...)        |
| [`components/providers/current-user-provider.tsx`](components/providers/current-user-provider.tsx) | `useCurrentUser()`: session identity + `GET /me`            |

## Project structure

```
app/                      layout (fonts, locale, providers), the single page, error boundary
components/
  app-shell.tsx           header + current view + submit dialog
  layout/                 header, logo slot, view nav, user menu, theme toggle, mobile FAB
  leaderboard/            toolbar, podium, ranked list, side sheet, pinned "my position" bar
  my-videos/              summary cards, video cards, empty state
  submit/                 submit dialog, form, URL field, preview, success + confetti
  common/                 avatars, platform badges, animated numbers, state panels, thumbnails
  providers/              app providers, i18n, current user
  ui/                     design-system primitives (button, input, dialog/sheet, menus, ...)
  auth/                   sign-in screen
  icons/                  platform brand icons, Microsoft logo
lib/
  api/                    types, HTTP client + adapter, mock adapter + data, TanStack Query hooks
  auth/                   Microsoft sign-in (Better Auth), access policy, session helpers
  i18n/                   locales, dictionaries, formatting
  validation/             Zod schemas
  hooks/                  URL state, media queries, viewport tracking, ...
  platforms.ts            platform config + link detection
styles/tokens.css         design tokens (colors, shadows)
proxy.ts                  route protection (sign-in required)
```

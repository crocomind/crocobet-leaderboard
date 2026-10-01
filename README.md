# Croco Creators

An internal leaderboard competition for Crocobet employees who post videos on Instagram,
Facebook, TikTok and LinkedIn. The employee whose videos collect the most views and reactions
wins.

This repository is the frontend. The backend isn't built yet, so the app runs against a typed
mock API until it is. See [`API_CONTRACT.md`](API_CONTRACT.md) for what the backend needs to
provide.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui-style components on
Radix · Motion (Framer Motion) · TanStack Query · React Hook Form + Zod · lucide-react · Vitest ·
ESLint + Prettier

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env   # skip if you already have a .env
npm run dev            # http://localhost:3000
```

With `NEXT_PUBLIC_USE_MOCKS=true` (the default in `.env.example`) nothing else is needed.

## Environment variables

| Variable                      | Used by  | Description                                                                                                                    |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_USE_MOCKS`       | Frontend | `true` uses the built-in mock API. Anything else calls the real API.                                                           |
| `NEXT_PUBLIC_API_BASE_URL`    | Frontend | Backend base URL, e.g. `https://api.example.com`. Required when mocks are off.                                                 |
| `NEXT_PUBLIC_MOCK_ERROR_RATE` | Frontend | Mocks only: the share of requests that fail on purpose (0 to 1, default 0.05). Use 0 for demos and 1 to see every error state. |
| `SUPABASE_*`                  | Backend  | Reserved for the backend. The frontend doesn't read them. Never prefix them with `NEXT_PUBLIC_`.                               |

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
take 350 to 900 ms, and about 5% fail so you can see error states. The signed-in mock user is
Tamar Lomidze, who is #14 in the default view. That shows the pinned "You're #14 · … behind #13"
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

## Adding authentication later

Authentication (Microsoft Entra ID) is intentionally not set up. The app is ready for it.
Components only get the user through `useCurrentUser()` and only call the API through one HTTP
client, so these are the only places to change:

1. **[`components/providers/current-user-provider.tsx`](components/providers/current-user-provider.tsx):**
   source the user from your auth session instead of (or in addition to) `GET /me`. Keep the
   `useCurrentUser()` return shape (`status`, `user`, `error`, `refetch`) and nothing else
   changes. This is also where to redirect to sign-in when there's no session.
2. **[`lib/api/http-client.ts`](lib/api/http-client.ts):** make `getAuthHeaders()` return
   ``{ Authorization: `Bearer ${token}` }``, using a silently acquired access token. Every API
   request already goes through it. To handle expired sessions, react to `ApiError` with
   `status === 401` in the same file.
3. **[`components/providers/app-providers.tsx`](components/providers/app-providers.tsx):** wrap
   the tree in your auth library's provider (for example, MSAL's `MsalProvider`), outside
   `CurrentUserProvider`.
4. **[`components/layout/user-menu.tsx`](components/layout/user-menu.tsx):** enable the
   **Sign out** item (remove `disabled` and the "Coming soon" tooltip and badge) and call your
   sign-out function in `onSelect`.

If you protect routes with Next.js middleware (`proxy.ts` in Next 16), add it at the project
root. Nothing else in the app needs to change.

Then set `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_API_BASE_URL` once the backend is live.

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
  icons/                  platform brand icons
lib/
  api/                    types, HTTP client + adapter, mock adapter + data, TanStack Query hooks
  i18n/                   locales, dictionaries, formatting
  validation/             Zod schemas
  hooks/                  URL state, media queries, viewport tracking, ...
  platforms.ts            platform config + link detection
styles/tokens.css         design tokens (colors, shadows)
```

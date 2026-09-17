# Front-end redesign

Covers three surfaces:

| Surface | Route | Live |
|---|---|---|
| Marketing landing page | `web-merchant` `/` | https://custva-web.vercel.app |
| Contact number | — | +91 63802 88707 (updated from +91 82706 57119) |
| Merchant login | `web-merchant` `/login` | https://custva-web.vercel.app/login |
| Admin login | `web-admin` `/login` | https://custva-admin.vercel.app/login |

Two goals: remove claims the product cannot support, and replace templated
layouts with a design derived from the product itself.

The merchant dashboard, admin dashboard, API and worker are unchanged. No
application logic was touched anywhere — both login rewrites are presentation
and copy only.

> Renamed from `LANDING-REDESIGN.md`; the work now spans more than the landing.

---

## 1. Files

### Changed

| File | Change |
|---|---|
| `web-merchant/app/page.tsx` | Landing page rewritten |
| `web-merchant/app/globals.css` | Old `.lp-*` and `.auth-*` blocks removed (~1,577 lines net); Tailwind entry + design tokens added; dashboard CSS preserved |
| `web-merchant/app/layout.tsx` | Three landing typefaces added alongside Poppins; font variables moved to `<html>` (see bug 13) |
| `web-merchant/app/login/page.tsx` | Presentation and copy rewritten |
| `web-admin/app/globals.css` | `.admin-auth-*` / `.admin-otp-*` blocks removed (494 lines); dashboard CSS preserved |
| `web-admin/app/layout.tsx` | Same three typefaces added alongside Poppins; same `<html>` move |
| `web-admin/app/login/AdminLoginClient.tsx` | Presentation and copy rewritten |
| `web-admin/app/login/page.tsx` | Suspense fallback class |
| `web-merchant/package.json`, `pnpm-lock.yaml` | Dependencies below |

Net across tracked files: **1,144 insertions, 2,763 deletions.**

### Added

| File | Lines | Purpose |
|---|---|---|
| `web-merchant/app/landing.css` | 661 | Landing styles, scoped under `.landing` |
| `web-merchant/app/auth.css` | 306 | Merchant login styles |
| `web-admin/app/auth.css` | 361 | Admin login styles (self-contained palette) |
| `web-merchant/components/landing/motion.ts` | 249 | anime.js orchestration, reveals, card tilt |
| `web-merchant/components/landing/Cadence.tsx` | 148 | Tier-by-tier lifecycle view |
| `web-merchant/components/landing/brand.tsx` | 136 | Logo components + icon set |
| `web-merchant/components/landing/ReturnLoop.tsx` | 109 | The hero loop |
| `web-merchant/components/landing/MessageArt.tsx` | 34 | Message preview photography |
| `web-merchant/postcss.config.mjs` | 7 | Tailwind v4 PostCSS plugin |

### Assets

| File | Size | Note |
|---|---|---|
| `custva-mark.png` | 25 KB | Logomark, yellow field removed |
| `custva-wordmark.png` | 31 KB | Wordmark, yellow field removed |
| `msg-brownie.jpg` | 68 KB | Message preview, 736×385 (1.91:1) |
| `msg-coffee.jpg` | 15 KB | Message preview, 325×170 (1.91:1) |

Both marks are copied into `web-admin/public/` as well.

### Dependencies

```
animejs               ^4.5.0    (dependency)
tailwindcss           ^4.3.3    (dev)
@tailwindcss/postcss  ^4.3.3    (dev)
```

**Tailwind is installed without preflight.** `globals.css` imports only
`tailwindcss/theme.css` and `tailwindcss/utilities.css`. Preflight would reset
the dashboard stylesheet out from under every app page.

---

## 2. Claims removed

Each was on the old landing page and is unsupported by the repository.

| Removed claim | Problem |
|---|---|
| "3x more repeat visits" | No data behind it |
| "60% reduction in churn" | No data behind it |
| "10s avg. customer capture time" | Never measured |
| "Zero extra per-message cost" | **False.** Meta bills per conversation on the WhatsApp Cloud API |
| "Secure & Compliant — DPDP-aligned data handling" | Compliance claim with nothing backing it; README §18 still lists CSRF as outstanding and email verification as cosmetic |
| "All data is stored on Indian cloud infrastructure" | Intended deploy is Vercel + containerised API + managed Postgres. Region is a deployment choice |
| "Multi-outlet management with branch-level analytics" | No such feature exists |
| "Free trial, no credit card needed" | There is no billing system |
| "Join Indian merchants using Custva" | Implies an install base that does not exist |
| "Set up in just 10 minutes" | The runbook is nine steps with Docker, migrations and seeds |
| "Live in minutes. Results in weeks." | Outcome promise |
| "lifetime value" | The code tracks retention revenue, not LTV |
| "© 2025 Custva" | Wrong year |

On the admin login, "All actions logged" was narrowed to "Admin actions are
recorded in the audit log" — `admin_audit_logs` and `writeAudit` exist, but
cover admin mutations, not everything.

### The product screenshot

`public/product-dashboard.png` was captioned *"See exactly how Custva works"*.
It is a mockup: invented figures (8,941 customers, 68.5% retention), fictional
names, dates in Oct 2023, and a sidebar that does not match the real merchant
app. Removed from the page; the file is still in `public/`, now unreferenced.

---

## 3. Claims added

All traceable to source.

| Statement | Source |
|---|---|
| Day 0 sends five minutes after the visit; day 3/7/14 count from visit date | `docs/api-contracts.md`, `TemplatesClient.tsx` |
| Four visit tiers, capped at the fourth | `apps/api/src/lib/lifecycle-service.ts` |
| A new visit cancels the pending schedule from the previous one | `docs/api-contracts.md` |
| Customers must opt in before follow-ups are scheduled | `whatsapp_opt_in` gate in lifecycle enrolment |
| Meta bills per conversation; Custva adds a per-merchant daily cap | `WA_MERCHANT_DAILY_CAP`, default 500 |
| Multi-outlet is **not** built | Absence of any branch/outlet model |
| Every message can carry an image | `header_image_url` — schema → `template-service` → admin API (URL-validated) → worker |
| The sixteen starter templates ship **without** images | All seeded rows have `header_image_url = NULL`; README §18 lists production header images as outstanding |
| Live vs Planned ledger | README §18 "Shipped hardening" / "Next (recommended)" |
| The sixteen template headers | Verbatim from `infra/db/migrations/0010_lifecycle_templates.sql` |

The page states plainly that Custva is an MVP with production hardening
unfinished. For a pitch this is a strength — it is checkable, and the
alternative is a prospect discovering it during a pilot.

Two claims written during this work and corrected on review:

- A heading reading "A real WhatsApp template, not a mock-up" — the card *is* a
  styled preview. Now "The parts of the message you control".
- Roadmap items labelled "In progress" when README lists them as not started.
  Now "Planned".

---

## 4. Design

### Signature: the return loop

The logomark is a "C" drawn as a return arrow, and the product is that loop — a
visit is recorded, four scheduled messages go out, the customer returns and the
cycle restarts one tier higher. The hero shows this mechanism rather than a
headline metric or a dashboard screenshot. It draws itself on load, the day
markers land in sequence, and a coral arrow carries the return leg back to the
origin. Below `md` it becomes a stacked list.

### Palette

Recovered from the logo artwork itself, not approximated — the old CSS assumed
`#0b1f3a` / `#ffd400`; the actual values are below.

| Token | Hex | Role |
|---|---|---|
| `--color-paper` | `#fffcf2` | Ground |
| `--color-paper-deep` | `#fff2cc` | Wells, inactive states |
| `--color-ink` | `#011244` | Brand navy |
| `--color-ink-soft` | `#4d5a80` | Secondary text (6.62:1 on paper) |
| `--color-yellow` | `#fdd304` | Brand yellow, full strength |
| `--color-yellow-deep` | `#8a6600` | Small type, focus rings |
| `--color-coral` | `#ff5c3a` | Third voice |
| `--color-coral-deep` | `#d63b1a` | Coral text |
| `--color-green` | `#0b7d4d` | Live states |

Yellow is used as area, not hairlines. The primary button is yellow with navy
text — 12.3:1, so the most vivid element is also the most legible. Coral keeps
navy+yellow from reading as a hazard sign. A near-invisible SVG grain sits over
every page; large flat light fields read as generated.

### Type

| Role | Face | Why |
|---|---|---|
| Display | **Gabarito** | Rounded geometric sans; the logomark is rounded terminals and a circular arc |
| Body | **Instrument Sans** | Narrow grotesque, keeps paragraphs compact |
| Utility | **DM Mono** | Day offsets, step markers, timers only — never nav, never buttons, never hints |

Poppins remains loaded in both apps for their dashboards, which style against
`--font-poppins`.

> This pairing was specified from the first commit but **did not actually render
> until bug 13 below was fixed** — every page silently fell back to Poppins. Any
> screenshot or description of the typography taken before that fix was wrong.

Cream + high-contrast serif + terracotta was avoided deliberately: it is a
current default rather than a choice.

### Landing structure

Nav · Hero + loop · The loop in detail (message previews + cadence) ·
Platform capabilities · Status ledger · FAQ · Contact · Footer

Cut from eight sections to six. Emoji feature icons replaced with a drawn set
matching the mark's stroke weight and round joins.

### The cadence view

The lifecycle grid was a 4×4 matrix — sixteen cells at once, which reads as a
spreadsheet. It now shows **one tier at a time**: four cards, in order, with the
timing said in words ("Five minutes after they leave", "Three days later") and a
rail that shifts yellow → coral across the fortnight. Tabs choose the tier.

`{{shop_name}}` no longer appears anywhere in visible copy — it is resolved to
an example shop, with one line explaining that it fills in automatically.

### Card tilt

Cards behave as floating boards under pressure: the edge nearest the cursor
recedes, rather than tipping toward it. A yellow sheen tracks the cursor. Both
are disabled under `prefers-reduced-motion` and on coarse pointers.

### Login pages

Both were the same stack of defaults — a dark gradient ground, two blurred glow
orbs, a glassmorphism card (`backdrop-filter: blur(20px)`), a yellow button with
a glow halo, a fake "C"-in-a-square logomark, and "Welcome back" copy.

Both now use the landing's ground, grain, type and button. Decorative step dots
became mono step markers (`STEP 1 OF 2 · PASSWORD`) that say where you are. OTP
boxes borrow the card treatment with digits set in mono — a genuine instrument
reading. Errors state what happened rather than apologising: "That email and
password do not match an account", not "Invalid email or password. Please try
again."

The admin page carries an extra `● ADMIN CONSOLE` badge. Two near-identical
logins on one platform is how someone ends up typing merchant credentials into
the admin console.

---

## 5. Bugs found and fixed

Every one of these passed the automated checks and was caught by looking at the
page or driving it with real input.

| # | Bug | Cause |
|---|---|---|
| 1 | Hero underline struck through the paragraph below | Absolute positioning against an *inline* element resolves to the inline box. Fixed with `inline-block` and em offsets |
| 2 | Pulse ring drifted off the visit node | An SVG transform scales about the user-space origin, not the shape's centre. Fixed with `transform-box: fill-box` |
| 3 | The loop read as an empty rounded box | Return leg tightened, directional arrow added |
| 4 | Card sheen greyed out body copy | An overlay lightens text along with the surface, whatever blend mode. Moved into the card's own `background-image`, behind content |
| 5 | Tilt stopped working after scroll reveal | anime.js left an inline `transform` that outranks the CSS one. Now handed back on completion |
| 6 | **Every Tailwind margin and padding utility was dead** | `* { margin: 0; padding: 0 }` in `globals.css` was *unlayered*, and unlayered CSS beats any cascade layer regardless of specificity. Moved into `@layer base` |
| 7 | **33 elements stayed invisible after a fast scroll** | anime.js `onScroll` detects *crossings*; a fling jumps thousands of pixels between frames and the crossing is never seen, so `opacity: 0` persists. Replaced with a rAF-throttled position check. Deep-linking to `#contact` had the same fault |
| 8 | Grey rectangle behind the logo | The source PNG's yellow field is not perfectly flat, so it projected to ~2–4/255 alpha across the whole frame. Low tail hard-zeroed |
| 9 | Brownie illustration read as a plant pot | Drawn as an inverted trapezoid — later replaced by photography anyway |
| 10 | Login autofocus stacked two focus rings | Navy focus border plus a gold outline. Fields now use border + soft ring |
| 11 | Disabled login button was faded yellow | Reads as broken rather than unavailable. Now a neutral surface |
| 12 | Admin `?reason=` notices rendered as green ticks | "Your session expired" is not a success. Now a neutral notice style |
| 13 | **The display typeface never applied — every page rendered in Poppins** | Tailwind's `@theme` emits `--font-display: var(--font-gabarito), …` onto `:root` (`<html>`), but `next/font` defined `--font-gabarito` on `<body>`. A `var()` with no fallback pointing at a property undefined *at that element* invalidates the whole declaration, so `font-family` fell through to the inherited Poppins. Silent — no error, no warning. Fixed by moving the font variables to `<html>` in both apps |

Numbers 6, 7 and 13 are the serious ones, and they share a shape: CSS that fails
silently. 6 meant page spacing was carried entirely by hand-written CSS with
every utility ignored; 7 meant anyone arriving via a shared `#contact` link saw a
mostly blank page; 13 meant the entire type direction was inert while every
screenshot appeared to confirm it.

All three were invisible to assertion-style checks that only asked "did the page
render?". Each was caught by asserting a *computed value* — `marginTop`,
`opacity` after a fling, `fontFamily` — rather than trusting the rendered output.
Bug 13 in particular survived several rounds of visual review because Poppins and
Gabarito are similar enough at a glance that nothing looked broken.

---

## 6. Verification

Both apps build, typecheck and lint clean. Remaining lint warnings are
pre-existing `<img>` notices in files this work did not touch.

| Route | Build |
|---|---|
| `web-merchant` `/` | Static, 34.6 kB |
| `web-merchant` `/login` | Static, 3.54 kB |
| `web-admin` `/login` | Static, 8.49 kB |

Driven in Chromium with **real input events** — `mouse.wheel` rather than
`window.scrollTo`, real clicks, and a real `ClipboardEvent` for the OTP paste.

| Check | Result |
|---|---|
| Horizontal overflow @ 1440 / 390 | 0 / 0 |
| Reveals reach full opacity — gentle scroll, fling, scroll-back, deep link | 44/44 in all four |
| Reduced motion | Everything visible, no animation |
| Card tilt | `--rx -4.48deg` / `--ry +4.90deg` on bottom-right hover; springs to 0 |
| Cadence tabs | Content swaps, no overflow |
| Braces in rendered copy | None |
| OTP paste (both logins) | Six digits distributed, submit enables |
| OTP timer | Counts from 10:00 |
| FAQ accordion, real click | 0 → 94px, `aria-expanded` true |
| Nav anchors | Scroll to target |
| Keyboard focus rings | Visible on both logins and the landing |
| Login / landing grounds identical | `rgb(255, 252, 242)` on all three |
| Body text contrast | 6.62:1 (AA) |
| Console / page errors | None |

Re-run against the live production URLs after deploy: all three surfaces return
200, `h1` computes to `Gabarito`, grounds match at `rgb(255, 252, 242)`, both
message photos and the wordmark load, the fling test shows 29/29 elements
visible, tier tabs switch, and there are no console or network errors.

---

## 7. Deployment

Both frontends are deployed to Vercel as **two separate projects**, matching the
`HANDOVER.md` note that each app is its own Root Directory.

| Project | Root Directory | Production URL |
|---|---|---|
| `custva-web` | `apps/web-merchant` | https://custva-web.vercel.app |
| `custva-admin` | `apps/web-admin` | https://custva-admin.vercel.app |

Both are `framework: nextjs` with SSO deployment protection **disabled**, so the
links are shareable without a Vercel account.

### Getting a pnpm workspace to build

Two failures worth recording, because they will recur on any fresh project:

1. **`npm error Unsupported URL Type "workspace:"`** — with no Root Directory
   set, Vercel uploaded only `apps/web-merchant` and ran `npm install`. There was
   no workspace root for `workspace:*` to resolve against.
2. **"No Next.js version detected"** — building from the repo root instead. The
   install succeeded (pnpm resolved all 519 packages), but Vercel checks the
   *root* `package.json` for `next`, and the monorepo root has no `next`.

The fix for both is the project's **Root Directory** setting, not a build
command override: it makes Vercel read `apps/<app>/package.json` while still
installing from the workspace root. A temporary root `vercel.json` was used
during debugging and removed once Root Directory was set — it is not needed and
is not in the repo.

### Deploying again

There is no Git integration: connecting the GitHub repo fails because this
account lacks write access to `Madan94/custva`. Redeploys are manual from the
repo root:

```bash
# merchant (root .vercel/project.json points here by default)
vercel deploy --prod

# admin — relink first, then restore
vercel link --yes --project custva-admin
vercel deploy --prod
vercel link --yes --project custva-web
```

### What is actually working in production

**Only the landing page is functional.** Neither login can authenticate: the
API, Postgres, Redis and every environment variable in
`apps/web-merchant/.env.local.example` are undeployed. Both login pages render
and validate input, but submitting fails, and `/dashboard`, `/customers`,
`/templates` and `/campaigns` will fail behind them.

These are design deployments, not a working demo.

### Observability

None. No log drains, no error-tracking integration, no `@vercel/analytics`;
README §18 lists Sentry and structured logging as unwired. Production failures
will be discovered by looking, not by being alerted. This should be closed
before anything real runs on these URLs.

---

## 8. Outstanding

- **No push access.** `Madan94/custva` returns
  `{"pull": true, "push": false, "admin": false}` for this account. Nothing here
  is committed or pushed. It also blocks Vercel Git integration, so redeploys
  stay manual.
- **Image licensing — now urgent.** `msg-brownie.jpg` and `msg-coffee.jpg` came
  from a downloads folder with hash filenames and look like found stock. They
  are being served from a public production URL. Rights need checking, or
  replace them with photos from a pilot merchant.
- **No error monitoring on a production deployment.** See §7.
- **`msg-coffee.jpg` is 325 px wide, and only 170 tall after the 1.91:1 crop** —
  noticeably softer than the brownie on a retina display. Wants a
  higher-resolution source; the portrait original leaves little to crop from.
- `public/product-dashboard.png`, `custva-large-logo.png` and
  `custva-loopy.png` are now unreferenced (~2.3 MB). Left in place.
- A real product screenshot, if one is wanted in place of the removed mockup,
  needs a seeded instance: `db:migrate`, `db:seed`, `db:seed-lifecycle`.
- The vector logo is a reconstruction from the bitmap. An SVG export from the
  original artwork would be better than either that or the cleaned PNGs.

---

## 10. "It looks like a blog" — 17 Sep 2026

The note back was that the page read as a blog, without anything separating
the sections. That was accurate, and the cause was structural rather than
decorative: **Features, Why Now and FAQ were the same object three times** —
eyebrow, big heading, list of icon + title + body. Only How It Works differed,
because it had numbers. Three identical shapes in a row is what "blog" means.

So the fix is not more decoration. Each section now has the shape of what it
actually is, and the devices are not shared between them:

| Section | What it is | How it is set |
|---|---|---|
| Why now | an argument | four claims on rules, large, **no icons** |
| How it works | a sequence | numbered steps — the only numbers on the page |
| Segments | a reading | **drawn data** — see below |
| Features | a set | the icon grid, now the only place icons appear |
| FAQ | a reference | collapsed, available rather than imposed |

### Hierarchy

Reordered as asked: **Why now → How it works → Segments → Platform features**.
The nav order now mirrors the page, so it reads as a map rather than a menu.

### The segments, drawn rather than described

This is the signature, and the answer to "something to differentiate the
segments in a unique way". Four more cards saying *"Overdue: past their usual
gap"* would have been a fifth copy of the same object.

So it does not describe the segments; it shows them. Each row is a timeline
with ticks where the customer visited and a bar for today. **The gap between
the last tick and today is the entire definition** — evenly spaced means on
schedule, a widening gap means overdue, one tick and silence means long gone.
A reader understands the model before reading a word of it.

Colour appears on only the two rows where something is wrong. Colouring all
four would make none of them mean anything.

It is also the one thing here a competitor cannot copy without first computing
per-customer rhythm, which is the actual product.

### Log in, top right

Where a returning merchant looks for it. Deliberately a quiet link rather than
a second button: the page sells to people without an account, and two buttons
in the same corner make the prospect and the returning merchant compete.
Hidden below 620px, where it already lives in the footer.

### FAQ

Native `<details>`, closed. Five answers laid open read as page content and pad
the page with text nobody asked for. Native rather than a JS accordion: it
opens with no script, it is keyboard-operable for free, and ctrl-F still finds
text inside a closed one in most browsers.

### Three bugs found while verifying

- **Dead CSS with live class names.** The previous FAQ was a JS accordion whose
  `.faq-a { overflow: hidden; max-height: 0 }` was still in the stylesheet. The
  new `<details>` markup reused the class, so every answer collapsed to one
  clipped line — which looked like a layout bug rather than an old rule still
  firing. Deleted rather than renamed around.
- **A click drew a keyboard focus ring.** `:focus-within` on the row fires for
  a mouse click too. `:focus-visible` on the summary is the thing that actually
  means "navigating by keyboard".
- **The last two reveals never fired.** The scroll sweep used a threshold of
  92% of viewport height, but at maximum scroll anything in the final 8% never
  crosses it and no further scroll event ever arrives to re-check. The phone
  number and the closing line in the contact panel stayed at opacity 0
  permanently. The whole viewport now counts once the document cannot scroll
  further.

That last one was only visible by driving real wheel events all the way to the
end of the document — scrolling each section into view stops short, because the
footer sits below the contact panel.

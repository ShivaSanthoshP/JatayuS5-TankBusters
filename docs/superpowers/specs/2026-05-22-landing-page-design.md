# Landing Page — ITOps Orchestrator

**Date:** 2026-05-22
**Status:** Approved design — ready for implementation plan
**Branch:** `ui-experimentation`

## Goal

Today, visiting the site URL drops the user straight into the Dashboard. We want a
**marketing landing page at `/`** that explains what ITOps Orchestrator does, builds
interest, and creates a strong first impression — with an explicit **"Enter app"**
call-to-action that takes the user into the dashboard.

A new visitor should leave the landing page understanding: it is an autonomous,
multi-agent AIOps platform; five AI agents monitor, predict, diagnose, remediate, and
report on infrastructure failures; it has institutional memory and a copilot named
Argus.

## Scope

**In scope:** a standalone landing page route, a routing change so the app no longer
owns `/`, and the landing page's own visual identity.

**Out of scope:**
- Re-theming the existing app to the landing palette — the user will do this later.
- Any change to the app's `@theme` tokens / warm-cream design system.
- Authentication or gating of the app behind the landing page.

## Decisions (locked with the user)

1. **Hero background** — use the literal reference video (external CloudFront URL),
   full-bleed, dimmed so it reads as ambient texture.
2. **Hero centerpiece** — a computer + terminal mockup (not a phone). The terminal
   types out live agent activity on a loop.
3. **Palette** — the landing page gets its **own** identity (off-white + blue, from
   the reference spec), independent of the app's warm-cream/teal system. The user
   plans to re-theme the app to match later; that migration is out of scope here.
4. **Slogan** — "Infrastructure that heals itself."
5. **Scope** — full landing page: hero + how-it-works + features + Argus + final CTA
   + footer.

## Routing

Current `App.tsx` mounts every route under `Layout`, with Dashboard at `/`.

New structure:

```
/            → <Landing />            (standalone, NOT inside Layout)
/dashboard   → <Dashboard />          (inside Layout — moved off "/")
/copilot     → <Copilot />            (unchanged)
/pipeline    → <Pipeline />           (unchanged)
/incidents   → <Incidents />          (unchanged)
/infrastructure, /datasources, /simulators, /runbooks, /settings  (unchanged)
```

Only the `/` collision is resolved — every other app route keeps its path.

**`App.tsx`** — add `<Route path="/" element={<Landing />} />` as a sibling of the
`Layout` route group; change the Dashboard child route path from `/` to `/dashboard`.

**`Layout.tsx`** — the `NAV` array's first entry becomes
`{ to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }`; the
`isDashboard` check becomes `location.pathname === '/dashboard'`.

`GlassTab` needs no change — `end={to === '/'}` resolves to `false` for all tabs,
which is correct because no app route is nested under another.

No app-side component links to `/` (verified: `CopilotPromo` and `CopilotLauncher`
target `/copilot`; the `Layout` wordmark is not a link). So moving Dashboard to
`/dashboard` is self-contained.

## Visual identity (landing only)

Defined as CSS custom properties scoped to a `.landing-page` root class, added to
`index.css` in a clearly-labelled block — kept separate from the app's `@theme` so
nothing leaks into the app and the values are easy to migrate later.

| Token | Value | Use |
|---|---|---|
| `--lp-bg` | `#F3F4ED` | page background |
| `--lp-ink` | `#1a1a1a` | primary text |
| `--lp-ink-soft` | `rgba(26,26,26,0.70)` | sub-text |
| `--lp-blue` | `#0871E7` | primary CTA |
| `--lp-blue-glint` | `#DEF0FC` | CTA top-glint highlight |
| `--lp-line` | `rgba(0,0,0,0.10)` | hairlines / borders |
| `--lp-term-bg` | `#0e1112` | terminal screen |
| `--lp-term-ink` | `#d9d4c8` | terminal text |

**Type:** Instrument Serif (headlines) and Inter (body) — both already loaded via
`index.html`. The terminal uses JetBrains Mono — already loaded. The reference spec's
Nokia pixel font is **dropped** (it was for the phone screen; there is no phone).

**Motion:** `framer-motion` (already a dependency; the reference's `motion/react` is
the same library). The app's root `<MotionConfig reducedMotion="user">` in `main.tsx`
already wraps all routes, so framer animations on the landing page honor reduced
motion automatically. Manual/CSS motion (video autoplay, terminal typing, cursor
blink) is gated explicitly with `useReducedMotion()` — see each section.

## Files

**New:**
- `frontend/src/pages/Landing.tsx` — page composition: the `.landing-page` root, the
  background video, and the ordered sections.
- `frontend/src/components/landing/LandingNav.tsx` — floating pill nav.
- `frontend/src/components/landing/Hero.tsx` — hero copy + CTAs; renders `HeroTerminal`.
- `frontend/src/components/landing/HeroTerminal.tsx` — the computer + typing terminal.
- `frontend/src/components/landing/HowItWorks.tsx` — the 5-agent pipeline.
- `frontend/src/components/landing/Features.tsx` — 4 feature highlights.
- `frontend/src/components/landing/ArgusSection.tsx` — the Argus copilot section.
- `frontend/src/components/landing/FinalCta.tsx` — closing call-to-action.
- `frontend/src/components/landing/Footer.tsx` — minimal footer.

**Modified:**
- `frontend/src/App.tsx` — routing.
- `frontend/src/components/Layout.tsx` — `NAV[0].to`, `isDashboard`.
- `frontend/src/index.css` — `.landing-page` scoped palette block.

## Section specs

### 1. LandingNav

Floating pill, fixed `top-6`, horizontally centered, `w-[95%] max-w-5xl`, `z-50`.
Backdrop blur, `rounded-full`, semi-transparent, `1px` `--lp-line` border. Flex,
space-between.

- **Left:** wordmark `ITOps` — Instrument Serif, ~`28px`, `--lp-ink`.
- **Right:** one button — **"Enter app"** — a `<Link to="/dashboard">`. Background
  `--lp-blue`, white text, `rounded-full`, `inset` shadow, with the reference's
  top-glint detail (an absolutely-positioned soft highlight rectangle, scales
  slightly wider on `group-hover`).
- **No tab links** (per the user). The pill holds only the wordmark and the CTA.

### 2. Hero

Container `min-h-screen`, `pt-24 md:pt-32`, flex column, centered content.

- **Background video:** the reference CloudFront URL, `<video autoPlay muted loop
  playsInline>`, `object-cover`, absolute `inset-0 z-0`. Above it, a tint/dim overlay
  (`bg-[--lp-bg]` at ~35–45% opacity, plus a soft top/bottom gradient) so the video
  reads as ambient "waves" texture and the foreground content + terminal dominate.
  `aria-hidden`. **Reduced motion:** when `useReducedMotion()` is true, do not
  autoplay — render the video paused (first frame) as a still backdrop.
- **Headline (`<h1>`):** "Infrastructure that heals itself." rendered on two lines
  ("Infrastructure" / "that heals itself."). Instrument Serif, responsive
  `text-[38px] md:text-[56px] lg:text-[72px]`, tight leading/tracking, `--lp-ink`.
  Enters with `motion` opacity `0→1` + scale `0.95→1`, `1.5s`, ease `[0.16,1,0.3,1]`.
- **Sub-headline (`<p>`):** "Five autonomous AI agents that monitor, predict,
  diagnose, and remediate failures across your multi-cloud fleet — in real time, with
  memory of every incident." Inter, `16–18px`, `--lp-ink-soft`, `max-w-xl`, centered.
  Enters with opacity `0→1` + `y 20→0`, `1.2s`, `delay 0.3`, same ease.
- **CTA row:** primary **"Enter app"** (`<Link to="/dashboard">`, blue, glint) +
  secondary **"See how it works"** (smooth-scrolls to the `#how` section).
- **Centerpiece:** `HeroTerminal`, below the CTAs, overlapping the lower hero.

### 3. HeroTerminal

A clean computer mockup. **Deliberately minimal chrome** — a borderless dark rounded
screen on a subtle monitor stand/silhouette. No fake macOS traffic-light dots, no fake
URL bar (those are the recognizable AI tell; the user wants a computer, not fake OS
chrome). Building the mockup is an intentional, user-requested exception to Hallmark's
"re-drawn chrome" guideline — the typing animation requires a built terminal.

Screen = a terminal: `--lp-term-bg` background, JetBrains Mono, `--lp-term-ink`.

**Typing behavior** — loops this script:

```
$ itops watch --fleet
monitor    anomaly · api-gw-3 · memory 94%
predict    failure likely in ~6 min
diagnose   root cause: connection pool exhausted
remediate  fix applied · rollback armed
report     resolved in 2m 11s · runbook saved
```

- Lines reveal sequentially with a typing feel (~18–25 ms/char), short pause between
  lines. The `$` command line types first. Each agent line shows a small braille
  spinner (`⠋⠙⠹⠸…`) while "running", swapped for a `✓` when the next line begins.
- After the full log holds ~2.5 s, the screen clears and the script replays.
- A blinking block cursor (`motion.span`, opacity `0→1→0`, `0.8s`, infinite, linear)
  trails the active line.
- **Reduced motion:** when `useReducedMotion()` is true, render the entire log
  statically (all lines, all `✓`, no spinners, no typing, steady non-blinking cursor).

The terminal log is illustrative product behavior (a sample run), not a marketing
statistic — comparable to a product screenshot.

### 4. HowItWorks (`id="how"`)

Section heading: "How it works". The five-agent pipeline as a connected horizontal
flow on desktop (`Monitor → Predict → Diagnose → Remediate → Report`), stacked
vertically on mobile. Each agent: name + one line.

- **Monitor** — "Watches every node for anomalies across CPU, memory, disk, network,
  latency and logs."
- **Predict** — "Forecasts failure probability and time-to-failure before impact."
- **Diagnose** — "Finds root cause and blast radius using recall of past incidents."
- **Remediate** — "Generates an executable fix with validation steps and rollback."
- **Report** — "Writes an executive summary and a runbook into institutional memory."

Light fade-up on scroll-into-view, once, staggered. Reduced motion → no transform,
content simply present.

### 5. Features

Section heading: "Built to stay ahead". Four highlights in a **varied** layout (not
three equal cards — vary widths/emphasis):

- **Predictive** — "Catches failures before they happen — not after the page fires."
- **Institutional memory** — "Every resolved incident is recalled to make the next
  one faster. The platform learns."
- **Multi-cloud** — "AWS, GCP, Azure, Prometheus and Docker — pluggable data sources,
  switchable at runtime."
- **Human-in-the-loop** — "Low-risk fixes auto-apply; high-severity changes pause for
  your approval."

### 6. ArgusSection

Heading: "Meet Argus — your fleet copilot." Body: "Ask your infrastructure anything
in plain English. Argus reads live telemetry, runs the pipeline, and explains what it
found." A secondary link **"Open Argus"** → `/copilot`.

### 7. FinalCta

A closing band. Heading: "Stop firefighting. Start orchestrating." One primary
**"Enter app"** button → `/dashboard`.

### 8. Footer

Minimal. `ITOps Orchestrator` wordmark · "Built by Team Tank Busters" · links:
"Enter app" (`/dashboard`), "API docs" (`/docs`). Single hairline top border. No
four-column link farm.

## Content honesty

No invented metrics anywhere — no fabricated percentages, no "10×", no
"trusted by N teams". Only real, concrete facts are used: five agents, the named
pipeline stages, seven data sources, the Argus copilot, RAG memory, multi-cloud,
human-in-the-loop. Outcome statements are qualitative. (The README's "80%" figure is
deliberately not carried onto the page.)

## Accessibility & responsiveness

- Background video: `aria-hidden`, `muted`, no audio track relied on; reduced-motion
  users get a paused still.
- One `<h1>` (hero), `<h2>` per section.
- All CTAs are real `<Link>`s; visible `:focus-visible` ring; touch targets ≥ 44 px.
- Contrast: `--lp-ink` on `--lp-bg` and white on `--lp-blue` both meet ≥ 4.5:1.
- Renders with no horizontal scroll at 320 / 375 / 414 / 768 / 1024 / 1440 px. The
  terminal mockup scales down (and may simplify) on small screens.
- Clickable text never wraps to two lines.

## Verification

- `npm run build` (tsc + vite) passes.
- ESLint introduces no new problems beyond the project's existing baseline.
- Manual: `/` shows the landing page; "Enter app" navigates to `/dashboard`; the app
  navbar and all nine pages still work; `/copilot` still reachable; the terminal
  types and loops; with OS "reduce motion" on, the video is paused and the terminal
  renders statically.

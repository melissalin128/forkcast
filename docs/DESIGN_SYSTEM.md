# Forkcast — Design System

## Principle zero: one number, then optional detail

Our users are not tech-savvy and are not here to read a spreadsheet. Every
screen leads with a single plain-language answer and hides the evidence
behind one tap.

- **Browse card** shows exactly three things: the restaurant, the cheapest
  platform with its delivered total, and one sentence like "$5 less than
  DoorDash". The other platforms' prices are not on the card.
- **Restaurant page** leads with "Cheapest right now: Grubhub, $21.40" and
  one big "Order on Grubhub" button. The per-platform fee breakdown and the
  price-history chart live in a collapsed "See how we got this" section.
- **At most 5 category chips** visible, the rest behind "More". One filter
  button opens a sheet; no filter chips row.
- **Sort** is a single dropdown defaulting to "Cheapest", not four tabs.
- **No jargon.** "Fees" not "service + small-order fee". "Best time to
  order" not "price window". Never show a percentage without a dollar
  amount next to it.
- **One accent action per screen.** Everything else is quiet.

## Direction: "the price terminal"


Delivery apps are bright, rounded, and photo-heavy because they want you to
browse and crave. We want the opposite feeling: a **calm, dark instrument
that tells you a number**. Editorial typography, one warm accent, one cool
accent, and a lot of restraint. Photos are used once (the hero) and never in
lists.

**Tone:** confident, dry, on your side. Copy says "$4.10 cheaper on Grubhub
right now", never "Yum! Great deals!".

## Color

Defined in oklch so accents share chroma and lightness.

| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(15% 0.008 60)` (#161412) | Page background, warm near-black |
| `--bg-raised` | `oklch(19% 0.009 60)` (#1f1c19) | Cards, ledger rows |
| `--bg-inset` | `oklch(12% 0.007 60)` (#100f0d) | Inputs, chart wells |
| `--line` | `oklch(30% 0.01 60)` (#3a3631) | Hairlines |
| `--fg` | `oklch(96% 0.006 80)` (#f5f2ec) | Primary text, warm off-white |
| `--fg-muted` | `oklch(68% 0.01 70)` (#a39c92) | Secondary text |
| `--accent` | `oklch(72% 0.17 55)` (#f0873f) | Tangerine: primary action, "now" marker |
| `--win` | `oklch(72% 0.17 160)` (#3fd39b) | Mint: cheapest / savings / good |
| `--warn` | `oklch(72% 0.17 25)` (#f56a6a) | Only for "price is spiking" |

Platform brand colors are used only as 6px identity dots and chart lines,
never as fills: DoorDash `#ff3008`, Uber Eats `#06c167`, Grubhub `#f63440`.


## Typography

- **Display:** `Syne` 700/800 — wide, slightly odd, unmistakable. Headlines and the big total.
- **Body:** `Manrope` 400/500/600 — quiet geometric, good at small sizes.
- **Numbers:** `JetBrains Mono` 500 — every price, ETA, and percentage is set in mono so columns line up and the eye reads them as data.

Scale (px): 12 · 14 · 16 · 20 · 28 · 40 · 64 · 96. Line-height 1.1 for display, 1.5 for body.

## Spacing and shape

4px base. Radii: 6px controls, 12px cards, 999px chips. Borders are 1px
`--line`, no drop shadows on dark. Cards get depth from a 1px top highlight
(`inset 0 1px 0 oklch(100% 0 0 / 4%)`), not from shadow.

## Motion (anime.js)

One orchestrated reveal per screen, then quiet.

- **Total counter**: numbers tween from 0 with `easeOutExpo`, 900ms, staggered 60ms per row. This is the signature move.
- **Ledger rows**: `translateY(12px) → 0`, opacity, stagger 50ms.
- **Cheapest row**: after rows land, mint left-edge draws in over 300ms.
- **Chips**: 120ms scale 0.96 → 1 on toggle. Nothing else animates on hover.
- Respect `prefers-reduced-motion`: all durations → 0.

## 3D (three.js)

Used exactly once, on the landing hero: a slow-drifting field of translucent
receipt-shaped planes behind the headline, lit by the tangerine accent. Low
poly, `alpha: true`, pointer parallax capped at 6°, paused when off-screen.
Never on data screens.

## Components

- **SearchBar** — 56px, inset bg, mono placeholder.
- **Chip** — 36px, pill, toggles. Active = accent outline + accent text.
- **SortSegment** — 4 options, underline indicator.
- **ResultCard** — restaurant name (display 20), cuisine + rating (muted), right side: best platform dot + name, total (mono 28), ETA, savings pill (mint).
- **PlatformLedger** — table, cheapest row highlighted mint, your-subscription badge.
- **PriceHistory** — 7-day line chart, one line per platform, "now" marker, best-window band in mint at 12% opacity.
- **BestTimeCallout** — raised card, one sentence, one number.

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

## Direction v2: "a delivery app that shows all three prices"

The v1 dark "price terminal" read as a restaurant website. The product is a
**price comparison tool that looks like the delivery apps people already
use**, with DoorDash as the inspiration for structure: a "Deliver to" row, a
search field, a round-icon category strip, a vertical feed of restaurant
cards, and a store page with tabs. Mobile first (390px), light, quick to
scan. Inspiration means the conventions of the category, never DoorDash's
logo, red, wordmark, icons or copy.

What makes it ours is the **compare strip** on every card (three columns,
one per platform, cheapest highlighted) and the **Prices tab** on every
store page (the three-platform ledger plus the 7-day history).

**Tone:** plain and helpful. "Cheapest on Grubhub · save $5.10 vs
DoorDash", never "Yum! Great deals!".

## Color

| Token | Value | Use |
|---|---|---|
| `--page` | #f7f6f3 | Page ground beyond the phone column, warm light gray |
| `--bg` | #ffffff | Cards, sheets, the app column |
| `--bg-muted` | #f2f0eb | Inputs, chip fills, table stripes |
| `--line` | #e8e5df | Hairlines |
| `--fg` | #1b1917 | Primary text |
| `--fg-muted` | #6f6a62 | Secondary text |
| `--accent` | #f0873f | Tangerine: the one primary action per screen, active tab |
| `--win` | #3fd39b (text #1f9d6f on white) | Cheapest / savings |
| `--warn` | #e5484d | Only for "pricier right now" |

Platform brand colors are used only as 8px identity dots, compare-strip
column headers and chart lines, never as fills: DoorDash `#ff3008`,
Uber Eats `#06c167`, Grubhub `#f63440`.

## Typography

- **Everything:** `Manrope` 400/500/600/700. Headlines are 700 at 20-24px.
- **Numbers:** `JetBrains Mono` 500 for every price, ETA and percentage so
  the compare strip columns line up.

Scale (px): 12 · 13 · 14 · 16 · 20 · 24 · 28. Line-height 1.4.

## Spacing and shape

4px base. Radii: 10px inputs, 12px cards, 999px chips and the segmented
sort. Cards sit on white with a 1px `--line` border and no shadow; the
sticky bottom CTA and the tab bar get a soft top shadow.

## Motion (anime.js)

- **Prices tab**: totals count up over 500ms `easeOutExpo` when the tab opens.
- **Chips / categories**: 120ms scale 0.96 → 1 on toggle.
- Nothing else animates. Respect `prefers-reduced-motion`.

## Components

- **DeliverToBar** — pin icon, "15213 · Oakland", chevron. Tapping opens zip entry.
- **SearchField** — 48px, `--bg-muted`, magnifier icon.
- **CategoryStrip** — horizontal scroll of 8 round line-icon categories; active = accent ring.
- **SortSegment** — Cheapest / Fastest / Top rated pill.
- **RestaurantRow** — 16:9 image, name, "4.7 (1.2k) · Ramen · 0.6 mi", then the CompareStrip and one savings line.
- **CompareStrip** — three equal columns (DoorDash · Uber Eats · Grubhub): dot + name, delivered total in mono. Cheapest column: mint text on a light mint tint. Not listed: "—".
- **StoreTabs** — Menu | Prices. Accent underline.
- **MenuItemRow** — item name, three platform prices, cheapest highlighted.
- **PlatformLedger** — Items / Fees / Promo / Total / ETA per platform, cheapest row tinted, subscription badge.
- **PriceHistory** — 7-day line chart, one line per platform, legend, "now" marker, cheapest-hour band.
- **StickyOrderCTA** — "Order on Grubhub · $21.40", accent, deep link.
- **TabBar** — Home, Search, Prices, Account. Only at ≤640px.

# Forkcast

Forkcast helps people answer a deceptively difficult question: **which delivery app will get the same meal to me for the lowest final price?**

Instead of making users repeat the same search across DoorDash, Uber Eats, and Grubhub, Forkcast brings the available options into one delivery-style interface and compares the amount that matters—the delivered total after menu markup, service fees, delivery fees, taxes, tips, subscriptions, and eligible promotions.

> Forkcast is a comparison and discovery tool. It does not process orders or payments, and it is not affiliated with DoorDash, Uber Eats, or Grubhub.

## Demo

https://forkcast-hackcmu.vercel.app/

## The problem

The price shown beside a menu item is rarely the price a customer ultimately pays. Each platform can apply different:

- Menu markups
- Delivery and service fees
- Small-order fees
- Subscription benefits such as DashPass, Uber One, or Grubhub+
- Time-limited promotions
- Delivery estimates

Finding the real cheapest option currently requires opening several apps, rebuilding the same cart, and comparing checkout screens manually. Prices also change throughout the week, leaving customers without a clear way to know whether ordering now is a good deal.

## The idea

Forkcast is a **price-comparison layer inside a familiar food-delivery experience**.

A user provides a Pittsburgh ZIP code, chooses any delivery subscriptions they already pay for, and searches for a restaurant or cuisine. Forkcast then:

1. Matches the same restaurant across supported platforms.
2. Builds a comparable representative order.
3. Calculates the delivered total on every available platform.
4. Highlights the cheapest and fastest choices.
5. Shows active promotions and the effect of subscription passes.
6. Tracks price snapshots to reveal better days and times to order.
7. Hands the user off to the selected delivery platform.

## Product highlights

- **One honest total:** Compare food, fees, taxes, tip, and promotions together.
- **Three-platform comparison:** DoorDash, Uber Eats, and Grubhub in one view.
- **Personalized totals:** ZIP code, tip preference, and existing subscriptions affect the result.
- **Useful filters:** Search and filter by cuisine, dietary needs, price, rating, and delivery speed.
- **Flexible sorting:** Find the cheapest total, fastest delivery, or highest-rated restaurant.
- **Price history:** Track changes over seven days and identify cheaper ordering windows.
- **Deals and promo visibility:** Show why a platform is winning instead of presenting a mysterious number.
- **Responsive experience:** Designed for desktop, mobile web, and a companion Expo application.
- **Direct handoff:** Open the restaurant on the selected delivery platform when available.

## Why it is different

Most delivery apps optimize for transactions within their own marketplace. Forkcast is platform-neutral: it is designed around the customer's full cost and makes the comparison logic inspectable.

The longer-term advantage is price history. Delivery platforms have little incentive to tell customers to wait until Tuesday afternoon, while Forkcast can use historical snapshots to surface exactly that recommendation.

## Hackathon scope

The hackathon version focuses on restaurant delivery in Pittsburgh, beginning with ZIP codes `15213`, `15217`, and `15232`. Grocery is treated as an adjacent food category; alcohol, electronics, pet supplies, payments, and in-app ordering are outside the initial scope.

The demo includes realistic seeded restaurant and price data so the experience remains reliable during judging. Simulated prices are labeled as demo data. Live platform collection is experimental and should only use permitted public information without bypassing authentication, CAPTCHAs, rate limits, or other access controls.

## Technology

- React 19 and TypeScript
- Vite 8
- Tailwind CSS 4
- Figma Make
- Responsive web UI with mobile-first interaction patterns

## Run locally

### Prerequisites

- Node.js 22
- pnpm 10+

### Setup

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The default Figma Make development port is `8443`.

### Production build

```bash
pnpm build
```

### Full web app and API

Each application installs independently:

```bash
npm install --prefix apps/api
npm install --prefix apps/web
cp .env.example .env
npm run dev:api                 # API: http://localhost:4000
npm run dev:web                 # Web: http://localhost:5173
```

The API uses seeded in-memory data when `MONGODB_URI` is unset, so the demo works without a database. Set `ADAPTER=mock` to ensure it never contacts live delivery platforms.

### Expo mobile app

```bash
cd apps/mobile
npm install
npm start
```

Scan the QR code with Expo Go, or use `npm run ios`, `npm run android`, or `npm run web`. On networks that block local device discovery, use `npx expo start --tunnel`.

## Repository layout

- `src/` — Figma Make web prototype
- `apps/web/` — full Vite and React web application
- `apps/api/` — Express and Mongoose comparison API
- `apps/mobile/` — Expo and React Native mobile application
- `apps/ios/` — Capacitor native wrapper
- `docs/PRODUCT_SPEC.md` — product decisions, data model, and collection plan
- `docs/DESIGN_SYSTEM.md` — visual and interaction system
- `design/` — design canvas artboards

## Product principles

1. Lead with one clear recommendation, then let users inspect the details.
2. Compare delivered totals—not incomplete menu prices.
3. Keep simulated, calculated, and live-scraped evidence visibly distinct.
4. Treat missing fee data as unknown rather than incorrectly assuming `$0`.
5. Preserve user control over subscriptions, tips, promotions, and ordering time.

## Contributors

| Contributor      | GitHub                                             |
| :--------------- | :------------------------------------------------- |
| Melissa Lin      | [@melissalin128](https://github.com/melissalin128) |
| Parth Dave       | [@ParthD25](https://github.com/ParthD25)           |
| Mauricio Posadas | [@mauposad](https://github.com/mauposad)           |
| Ryan Tang        | [@ryantang](https://github.com/ryantang)           |

Contributor identities were verified from repository history and confirmed project information.

## Status

Forkcast is an early-stage hackathon prototype. Pricing shown in demo mode is illustrative and should be rechecked in the destination delivery app before placing an order.

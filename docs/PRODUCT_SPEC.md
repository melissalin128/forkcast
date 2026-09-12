# Forkcast — Product Spec (v0.1, design phase)

> Working name. "Forkcast" = fork + forecast: we tell you which app, and which
> hour, gets the same meal to your door for the least money. Rename freely.

## 1. The one-sentence pitch

**A delivery app that looks and feels like DoorDash or Grubhub, except that
every restaurant card shows what the same order costs on DoorDash, Uber Eats
and Grubhub, and which one is cheapest right now.** Under the hood we scrape
the three platforms, keep the price history, and tell you when to order.

The UX is deliberately a replication of the delivery apps people already
use (address bar, category row, restaurant grid, restaurant page). The twist
is the comparison strip on every card and the platform ledger on every
restaurant page. Familiar shell, new information.

## 2. Decisions we are locking for the hackathon

These came out of the brainstorm doc. Each one has a reason so we can revisit
it deliberately, not by accident.

| # | Decision | Reason |
|---|----------|--------|
| D1 | **Food delivery only.** No grocery, alcohol, electronics, pet, retail. | "Stick to 1 domain and do it right." Instacart has no markup so there is nothing to compare; Uber Eats' non-food verticals dilute the value prop. Category filter stays in the data model so it can be widened later. |
| D2 | **Compare the *true total*, not menu price.** Total = items (with platform markup) + service fee + delivery fee + small-order fee + tax + tip. | Menu prices differ by platform by 10-30%; fees differ more. Anything less than the delivered total is a lie to the user. |
| D3 | **Subscriptions are an input, not a feature.** Onboarding asks which passes you pay for (DashPass, Uber One, Grubhub+). Totals are recomputed with your pass applied. | Answers "is it even worth considering if they have subscriptions?" Yes, because the answer changes per person. We do not sell or compare subscriptions in v1. |
| D4 | **Promos are first-class and time-bounded.** Every offer carries an optional `promo` with a code, discount rule, and expiry. Totals show pre- and post-promo. | "Dynamically able to adjust for promo deals." Promos are the most volatile part of the price and the biggest reason one app wins on a given night. |
| D5 | **Price history is the moat.** Every fetch writes a `PriceSnapshot`. The restaurant page shows a 7-day sparkline per platform and a "best hour to order" callout. | This is the thing DoorDash will never build. It is also what makes the app worth reopening. |
| D8 | **Three platforms: DoorDash, Uber Eats, Grubhub.** Postmates dropped (Uber-owned, prices track Uber Eats). | Three scrapers is the most the team can keep working during a hackathon. |
| D6 | **Zip code is the only required input.** Address is optional and only affects delivery ETA precision. | Lowest-friction entry. Zip is enough to know which platforms serve you and roughly what delivery fees look like. |
| D7 | **Sort and filter set is fixed for v1** (below). No free-text "natural language" filters. | Combined filters like "Italian, under $20 total, in 30 min" are expressible with the fixed set. |

## 3. Who it's for

**Primary persona: the price-aware weeknight orderer.** College student or
young professional, orders delivery 2-4x/week, has at most one subscription,
already opens two apps side by side before ordering. They want a number, not
a feed.

**What they're looking for (in priority order):**

1. Cheapest delivered total for what I already want to eat.
2. Am I about to overpay because it's 7 pm on a Friday? Should I wait an hour?
3. Is there a promo code I don't know about?
4. Fast enough (ETA is a tiebreaker, not the goal).
5. Highly rated (also a tiebreaker).

**Intra-personal customization ("HawtPix" in the brainstorm):** the app learns
from the user's own history, not from the crowd. Saved restaurants, usual
order, usual time, and their subscriptions shape the default sort and the
"best time" recommendation. No social layer in v1.

## 4. Core flows

### 4.1 Onboarding (60 seconds)
1. Enter zip code.
2. Toggle subscriptions you pay for: DashPass / Uber One / Grubhub+ / none.
3. Optional: dietary defaults (vegan, vegetarian, gluten-free, halal, kosher, nut-free).
4. Land on Search.

### 4.2 Search (the home screen)
- Search bar: cuisine, dish, or restaurant name.
- Filter chips: **Cuisine**, **Price range** (total $ / $$ / $$$), **Dietary**, **Delivery time** (< 30 / < 45 / any), **Rating** (4.0+ / 4.5+).
- Sort: **Cheapest total** (default), **Fastest delivery**, **Highest rated**, **Cheapest delivery fee**.
- Results are *restaurants*, each card showing the best platform for that restaurant right now, the delivered total, the ETA, and how much you save vs the most expensive platform.

### 4.3 Restaurant compare (the money screen)
- Header: restaurant, cuisine, rating, distance.
- **Platform ledger**: one row per platform, columns = subtotal, fees, promo, total, ETA. Cheapest row is highlighted. Your subscription is applied and shown.
- **Price history**: 7-day line per platform, and a "Best time to order" callout ("Tuesday 2-4 pm is on average 18% cheaper than now").
- **Order on [platform]** deep-links out. We do not process payment in v1.

### 4.4 Alerts (v1.5, designed but not built)
- "Tell me when this restaurant drops under $X on any platform."

## 5. Data model (MongoDB)

Collections, with the field that matters most in bold.

- `platforms` — `{ slug, name, brandColor, subscriptionName, subscriptionPerks }`
- `restaurants` — `{ name, cuisine[], dietaryTags[], rating, priceTier, location {zip, geo}, platformIds{} }`
- `offers` — a restaurant *as listed on one platform at one moment*: `{ restaurantId, platformSlug, subtotal, serviceFee, deliveryFee, smallOrderFee, tax, **total**, etaMin, etaMax, promo?, fetchedAt }`
- `priceSnapshots` — append-only history: `{ restaurantId, platformSlug, total, deliveryFee, etaMin, promoApplied, **capturedAt** }`. Indexed on `(restaurantId, platformSlug, capturedAt)`.
- `promos` — `{ platformSlug, code, rule {type: percent|flat|freeDelivery, value, minSubtotal}, startsAt, **endsAt** }`
- `users` — `{ zip, subscriptions[], dietaryDefaults[], savedRestaurantIds[], history[] }`

Totals are computed server-side by `computeTotal(offer, userSubscriptions, activePromos)` so the web app never re-implements fee logic.

## 6. Where the prices come from: scraping

None of the three platforms have a public pricing API, so the data layer is
three scrapers behind one interface.

```
PlatformAdapter
  searchRestaurants(zip, query)  -> Restaurant[]   (name, cuisine, rating, image, platform-specific id)
  fetchOffer(platformRestaurantId, zip, cart) -> Offer   (subtotal, fees, promo, total, ETA)
```

Adapters: `apps/api/src/adapters/doordash.ts`, `ubereats.ts`, `grubhub.ts`.
Each one runs headless Chromium (Playwright), sets the delivery zip, opens the
store page, reads the menu prices and the fee breakdown from the checkout
drawer, and returns an `Offer`. A `RestaurantMatcher` joins the same physical
restaurant across platforms by normalized name + street address.

Every `fetchOffer` also appends a `PriceSnapshot`, which is what powers price
history and the "best time to order" callout.

**Scraper realities to plan around:**
- Each platform renders prices only after a delivery address is set. The
  adapter sets it via the address modal once per session and reuses cookies.
- Fees appear at checkout, not on the store page. The adapter adds one
  representative item to the cart to expose the fee breakdown, then clears it.
- Rate-limit ourselves: one page every 2-3 seconds per platform, cache offers
  for 10 minutes, and schedule background refreshes for saved restaurants.
- Bot detection will bite. Keep a `mock` adapter (`adapters/mock.ts`) with
  realistic fee structures and hour-of-day curves so the demo never depends
  on three live sites behaving.

## 6a. Demo fallback

`apps/api/src/seed.ts` loads ~40 Pittsburgh restaurants with seven days of
simulated snapshots. `ADAPTER=mock` in `.env` serves those instead of
scraping. Say this plainly in the demo; judges respect it.

## 7. Open questions (need a human decision)

- **Name.** "Forkcast" is a placeholder.
- **Tip handling.** Include a default 15% tip in the total, or show it separately? Recommendation: include it, with a slider on the compare screen.
- **How much do we replicate?** Recommendation: mirror DoorDash's information architecture (address bar, category row, card grid, store page) but keep our own visual language so it reads as a product, not a clone.
- **Scraper legal posture.** Scraping public prices for personal comparison is common practice, but each platform's ToS forbids it. Hackathon-only; do not ship to the public without counsel.
- **Do we deep-link or just show the number?** Deep-linking is a 30-minute task and closes the loop.

## 8. Out of scope for v1

Payment, group orders, in-app ordering, non-food categories, social features,
subscription reselling, restaurant-side dashboard.

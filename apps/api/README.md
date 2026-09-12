# Forkcast API

Express + Mongoose + TypeScript. Serves restaurant comparisons across DoorDash,
Uber Eats and Grubhub, computes delivered totals server-side, and keeps price
history for the "best time to order" callout.

```bash
# from the repo root
npm install
npm run dev -w apps/api        # http://localhost:4000, tsx watch
npm run build -w apps/api      # tsc -> apps/api/dist
npm start -w apps/api          # node dist/server.js
npm test -w apps/api           # node:test via tsx
npm run seed -w apps/api       # needs MONGODB_URI
```

## Environment

Read from the repo-root `.env` (see `.env.example`), falling back to the cwd.

| var           | default | notes |
|---------------|---------|-------|
| `MONGODB_URI` | unset   | When unset **or unreachable**, the API logs one warning and serves an in-memory copy of the seed (restaurants, promos, 7 days of hourly snapshots). Everything works; users just don't persist across restarts. |
| `ADAPTER`     | `mock`  | `mock` = deterministic fee curves from `src/adapters/mock.ts`. `live` = the Playwright scrapers in `src/adapters/{doordash,ubereats,grubhub}.ts`, which are skeletons today and answer `501 live scraping not wired yet`. |
| `PORT`        | `4000`  | |

## Endpoints

All under `/api`. Money is in dollars, times in minutes, dates ISO-8601.

### `GET /api/health`
`{ ok, adapter: "mock"|"live", store: "mongo"|"memory", time }`

### `GET /api/restaurants`
Query params (all optional):

| param | example | meaning |
|-------|---------|---------|
| `zip` | `15213` | 5-digit zip. Demo service area: any 152xx zip sees all seeded restaurants. |
| `q` | `pizza` | matches name, cuisine, or the sample item |
| `cuisine` | `Thai` | case-insensitive substring on the cuisine list |
| `dietary` | `vegan,gluten-free` | every tag must be present |
| `maxTotal` | `25` | best delivered total (after your subscriptions/promos) |
| `maxEta` | `30` | fastest platform's `etaMax` must be at most this |
| `minRating` | `4.5` | |
| `sort` | `cheapest` (default) `fastest` `rated` `cheapestFee` | |
| `subs` | `dashpass,uberone` | your subscriptions; also accepts `grubhubplus` / `Grubhub+` |
| `tip` | `0.15` | tip fraction included in every total (default 15%) |
| `limit` | `60` | |

Response: `{ zip, sort, subscriptions, activePromos, count, results: Card[] }` where a `Card` is the
restaurant plus `offers[]` (one per platform, sorted cheapest first), `best`, `worstTotal` and
`savings`. Each offer carries the full breakdown from `computeTotal`:
`subtotal, serviceFee, deliveryFee, smallOrderFee, tax, tip, promoDiscount, total`, plus
`promoCode`, `subscriptionApplied`, `listTotal` (pre-subscription/promo), `etaMin/etaMax` and a
`deepLink`. Platforms that could not be priced land in `unavailable[]` with the error.

### `GET /api/restaurants/:id`
`:id` is a Mongo ObjectId or the slug (`pamelas-p-and-g-diner`). Same params as above minus filters,
plus `days` (default 7). Adds:

- `history: [{ platformSlug, points: [{ capturedAt, total, deliveryFee, etaMin, promoApplied }] }]`
- `bestWindow: { dayOfWeek, dayName, startHour, endHour, avgTotal, pctBelowNow, samples, label }`
  computed from the snapshots: cheapest platform per hour, averaged by (weekday, hour), grown into
  a contiguous window within 1% of the minimum.

### `GET /api/promos?platform=doordash`
Active promos (`startsAt <= now <= endsAt`), optionally for one platform.

### `POST /api/users`
Body `{ zip, subscriptions?: ["dashpass"|"uberone"|"grubhubplus"], dietaryDefaults?: [...] }` -> `201` user.
`GET /api/users/:id` reads it back. (In-memory store: ids look like `usr_xxxxxxxx` and vanish on restart.)

## Pricing rules (`src/pricing/computeTotal.ts`)

`computeTotal(offer, userSubscriptions, activePromos, tipPct = 0.15, now = new Date())`

- **DashPass** (DoorDash, subtotal >= $12): delivery fee -> $0, service fee -> 5% of subtotal
- **Uber One** (Uber Eats, subtotal >= $15): delivery fee -> $0, service fee -> 5% of subtotal
- **Grubhub+** (Grubhub, subtotal >= $12): delivery fee -> $0
- Promos (`percent | flat | freeDelivery`, each with `minSubtotal`) apply only inside their
  `[startsAt, endsAt]` window and only for the offer's platform; the biggest discount wins.
- `total = subtotal + serviceFee + deliveryFee + smallOrderFee + tax + tip - promoDiscount`, floored at 0.

## Mock adapter curves (`src/adapters/mock.ts`)

Delivery fee, ETA and (at peak) the service fee are scaled by a demand multiplier: dinner 17-20h +15% (18-19h +25%),
Fri/Sat +10%, Tue/Wed 14-16h -15%, small lunch/late-night bumps, and a deterministic +/-3% jitter
per hour bucket. Menu markups: DoorDash 12%, Uber Eats 15%, Grubhub 8%. Service fee 15%/15%/10%
with floors and caps; small-order fees below $12/$15/$12. Tax 7%.

## Layout

```
src/
  server.ts        entrypoint (listen), app.ts (express app)
  config.ts        dotenv from repo root, PORT / MONGODB_URI / ADAPTER
  db.ts            Mongo connect with in-memory fallback
  models/          Mongoose schemas + shared TS domain types
  pricing/         computeTotal, bestWindow (+ tests)
  adapters/        PlatformAdapter interface, mock, doordash/ubereats/grubhub skeletons
  matcher/         RestaurantMatcher: join the same restaurant across platforms (+ test)
  repo/            Repository interface, MemoryRepository, MongoRepository
  services/        offers (cache -> adapter -> snapshot -> computeTotal), geo
  routes/          health, restaurants, promos, users, error handler
  seed/data.ts     3 platforms, ~45 Pittsburgh restaurants, promos
  seed/snapshots.ts hourly snapshot generator
  seed.ts          `npm run seed` (Mongo, idempotent)
```

## Wiring the live scrapers

Each skeleton documents the exact navigation (address modal -> store page -> menu price ->
add one item -> read checkout fees -> clear cart) as TODO code. To activate: `npm i -w apps/api
playwright`, replace the placeholder `Browser`/`Page` types in `src/adapters/scraperBase.ts`,
fill in the TODOs, and set `ADAPTER=live`. Keep the 2.5 s per-platform throttle and the 10-minute
offer cache; every `fetchOffer` still appends a `PriceSnapshot` automatically.

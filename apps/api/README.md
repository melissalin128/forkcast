# Forkcast API

Express + Mongoose + TypeScript. Serves restaurant comparisons across DoorDash,
Uber Eats and Grubhub, computes delivered totals server-side, and keeps price
history for the "best time to order" callout.

```bash
cd apps/api                    # the API installs standalone (the repo-root package.json is a separate prototype)
npm install
npm run dev                    # http://localhost:4000, tsx watch
npm run build                  # tsc -> apps/api/dist
npm start                      # node dist/server.js
npm test                       # node:test via tsx
npm run seed                   # needs MONGODB_URI
npm run scrape -- --zip 15213 --q pizza   # live scrape, see "Live scraping" below
```

## Environment

Read from the repo-root `.env` (see `.env.example`), falling back to the cwd.

| var           | default | notes |
|---------------|---------|-------|
| `MONGODB_URI` | unset   | When unset **or unreachable**, the API logs one warning and serves an in-memory copy of the seed (restaurants, promos, 7 days of hourly snapshots). Everything works; users just don't persist across restarts. |
| `ADAPTER`     | `mock`  | `mock` = deterministic fee curves from `src/adapters/mock.ts`. `live` = the Playwright scrapers in `src/adapters/{doordash,ubereats,grubhub}.ts` (see "Live scraping"). `/api/restaurants` goes through the same offers service and 10-minute cache either way. |
| `PORT`        | `4000`  | |
| `SCRAPER_*`   |         | Scraper knobs, listed under "Live scraping". |

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

### `POST /api/scrape`
Body `{ zip, q, platforms?: ["doordash"|"ubereats"|"grubhub"], limit?: 10 }`. Runs the same job as
`npm run scrape` with the process's adapters (`ADAPTER=live` for real prices) and returns
`{ zip, q, startedAt, finishedAt, platforms: { <slug>: { ok, listings, offers, error?, blocked? } },
rows: [{ name, address, slug, restaurantId, platformIds, offers: { <slug>: { total, subtotal, deliveryFee,
serviceFee, smallOrderFee, tax, etaMin, etaMax, deepLink, promoCode?, locationUnverified? } }, errors, cheapest,
savings }], allFailed }`. One scrape runs at a time per process: a second call while one is running gets
`409`. `502` when every platform failed. `GET /api/scrape` shows the lock and the last result.

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

## Live scraping

The live adapters drive real Chromium (Playwright) against doordash.com, ubereats.com and
grubhub.com from **your** laptop, collect the prices for a zip + search term, join the same
restaurant across platforms and store offers + price snapshots through the Repository, so the app
can show which platform is cheaper and build price history.

> Personal / hackathon use only. All three sites' terms of service restrict automated access; this
> runs one slow browser per platform (>= 2.5 s between page loads, images/fonts blocked, offers
> cached 10 minutes), never orders anything, and stores nothing but public menu prices and fees.
> Do not point it at the sites at scale.

### Install

```bash
cd apps/api
npm install
npx playwright install chromium      # once; downloads the Chromium build Playwright expects
```

### First run: headed, set your address

Each platform only shows prices for a delivery address, and each site may show a bot challenge
the first time it sees a new browser. The scrapers keep one persistent Chromium profile per
platform in `apps/api/.browser-profile/<platform>` (git-ignored), so whatever you do in that
window sticks: solve the challenge once, set the address once, optionally log in once.

```bash
SCRAPER_HEADLESS=false npm run scrape -- --zip 15213 --q pizza --platforms grubhub
```

A Chromium window opens. If you see "Just a moment" / "Verify you are human", pass it. If the
site asks for an address, type your zip (or full address) and pick the suggestion. From then on
headless runs (`SCRAPER_HEADLESS` unset) reuse that profile. If a site ever blocks again, the run
fails with a `BlockedError` telling you to repeat the headed run.

The adapters also set the location themselves:

- **Grubhub**: the search URL carries `latitude`/`longitude` for the zip; Grubhub reverse-geocodes
  it and prices against that point. No modal needed. (Verified working.)
- **Uber Eats**: the `uev2.loc` cookie (Uber's own address cookie) is written from the zip's
  coordinates; the address typeahead is the fallback.
- **DoorDash**: the address modal is driven (Enter delivery address -> type -> first suggestion -> Save).

Zip -> coordinates comes from the seeded Pittsburgh centroids, then api.zippopotam.us (free, no key).
When none of that works the offer is still returned with `locationUnverified: true` (shown as `?`
after the price in the table) so you know the fees may be for the site's default location.

### Commands

```bash
npm run scrape -- --zip 15213 --q ramen --platforms doordash,ubereats,grubhub --limit 10
npm run scrape -- --zip 15213 --q pizza --platforms grubhub --limit 3 --json   # full JSON instead of the table
npm run scrape:watch -- --zip 15213 --q pizza        # repeats every 30 min (--every N to change)
npm run scrape -- --zip 15213 --q pizza --allow-mock  # price a platform with the mock adapter if its scraper fails
ADAPTER=live npm run dev                              # /api/restaurants and POST /api/scrape use the live adapters
```

`npm run scrape` always uses the live adapters and exits non-zero only when **every** requested
platform failed. Without `MONGODB_URI` it writes to the in-memory store (useful to check the table;
history is lost on exit); with it, restaurants/offers/snapshots persist and `GET /api/restaurants/:id`
shows the accumulated history and best-time-to-order window. Note that with `ADAPTER=live` and no
Mongo the server's memory store starts **empty** (the seed's platform ids are not real store ids), so
`POST /api/scrape` first, then `/api/restaurants` prices those restaurants live through the 10-minute
cache.

Output:

```
restaurant          | DoorDash | Uber Eats | Grubhub | cheapest
--------------------+----------+-----------+---------+-------------------
Papa Johns          | -        | -         | $19.35  | Grubhub
```

`-` = not listed on that platform, `error` = that platform failed for this store (see the log lines
above the table), `(mock)` = `--allow-mock` fallback, `?` = location unverified.

| env | default | |
|-----|---------|---|
| `SCRAPER_HEADLESS` | `true` | `false` opens a visible window (first run, challenges, logging in). |
| `SCRAPER_SLOWMO_MS` | `0` | Slow every browser action down, for watching what it does. |
| `SCRAPER_DEBUG` | unset | Log once per field a parser could not read. |
| `SCRAPER_DEBUG_DIR` | unset | Write a screenshot + HTML dump when a platform blocks. |
| `SCRAPER_SKIP_CART` | unset | `1` skips the add-to-cart/checkout step on DoorDash and Uber Eats. |
| `SCRAPER_TAX_RATE` | `0.07` | Tax rate used only when a platform does not report one. |
| `SCRAPER_PROXY` / `SCRAPER_NO_PROXY` | `HTTPS_PROXY` / `NO_PROXY` | Proxy for Chromium. |
| `SCRAPER_CHROMIUM_ARGS` | unset | Extra Chromium flags. |
| `SCRAPER_FETCH_BRIDGE` | unset | `1` routes page requests through Playwright's Node HTTP client (only for sandboxes whose TLS-intercepting proxy rejects Chromium's handshake; not for laptops). |
| `SCRAPER_PROFILE_DIR` | `apps/api/.browser-profile` | Where the per-platform Chromium profiles live. |

### What each platform's numbers mean

Every offer is `subtotal + serviceFee + deliveryFee + smallOrderFee + tax (+ 15% tip in total)`.
`subtotal` is the price of your cart lines when they can be matched by name on the menu (the
restaurant's `sampleItem`, or the search term on a first scrape), otherwise a representative item
(a "popular" dish, else the median-priced one); the item used is stored on the offer as
`representativeItem`.

- **Grubhub** (`parsers/grubhub.ts`): everything comes from Grubhub's own JSON. `deliveryFee` is the
  live fee for your point (`restaurant_availability.delivery_fee`), `serviceFee` is Grubhub's rule
  for the store (e.g. 10% capped at $9, "15% service fee (max $7.50)" on the page), `smallOrderFee`
  applies below the store's threshold (e.g. $2 under $10), `tax` uses the store's `sales_tax`
  percent. ETA is `delivery_estimate_range_v2`. No cart is created.
- **Uber Eats** (`parsers/ubereats.ts`): store page state gives item prices, the "$x.xx Delivery Fee"
  badge and the ETA range. Uber only itemises **service fee / taxes on the checkout page, which needs
  a signed-in account**: the scraper adds the representative item, opens checkout, reads the lines
  (`Subtotal`, `Delivery Fee`, `Service Fee`, `Taxes & Other Fees`) and removes the item. Log in once
  in the headed window and those lines get filled; logged out they are `0` (logged with
  `SCRAPER_DEBUG`).
- **DoorDash** (`parsers/doordash.ts`): the store feed gives display prices, "$x.xx delivery fee"
  and the delivery time. Service fee / small order fee / estimated tax are again **checkout-only and
  behind login**; same add-item -> checkout -> read -> remove flow, same `0` when not visible.

Promo copy the parsers can read ("20% off orders $25+", "$5 off $20+", "Free delivery on $15+")
becomes an `Offer.promo` rule; anything else is ignored rather than guessed.

### How blocking looks and what to do

From a datacenter IP, doordash.com and ubereats.com answer every request with HTTP 403 and a
Cloudflare "Just a moment… Performing security verification" page that never clears; grubhub.com
serves normally. The scrapers detect that (`BlockedError`: status 403/429 or body text matching
`access denied | verify you are human | unusual traffic | captcha | just a moment | performing security
verification`) and fail fast with:

```
doordash: blocked by the site's bot protection (page says "Just a moment"). Re-run with
SCRAPER_HEADLESS=false, pass the challenge in the browser window that opens and set your delivery
address there, then run again; the profile in .browser-profile/doordash keeps the clearance.
```

Do exactly that, from a residential connection. Data is never faked: a blocked platform shows
as `FAILED` and its column stays empty, unless you pass `--allow-mock`.

Layout of the scraper code:

```
src/adapters/browser.ts        shared launcher: persistent profile, UA/viewport/locale, request blocking, throttle
src/adapters/scraperBase.ts    BlockedError, isBlocked, ResponseCapture, PlaywrightScraper base
src/adapters/parsers/*.ts      pure parsers (HTML/JSON string in, plain objects out) + fixture tests
src/adapters/{grubhub,ubereats,doordash}.ts   the adapters (search, setDeliveryLocation, fetchOffer)
src/services/zipGeo.ts         zip -> lat/lng
src/services/scrapeJob.ts      search -> match -> upsert -> fetchOffer -> saveOffer/appendSnapshot -> table
src/scrape.ts                  the CLI; src/routes/scrape.ts the POST /api/scrape route
```

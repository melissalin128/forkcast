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
npm run deals -- --status                 # Apify deals feed, see "Deals feed" below
```

## Environment

Read from the repo-root `.env` (see `.env.example`), falling back to the cwd.

| var           | default | notes |
|---------------|---------|-------|
| `MONGODB_URI` | unset   | When unset **or unreachable**, the API logs one warning and serves an in-memory copy of the seed (restaurants, promos, 7 days of hourly snapshots). Everything works; users just don't persist across restarts. |
| `ADAPTER`     | `mock`  | `mock` = deterministic fee curves from `src/adapters/mock.ts`. `live` = the Playwright scrapers in `src/adapters/{doordash,ubereats,grubhub}.ts` (see "Live scraping"). `apify` = Apify actors collect instead (see "Collecting through Apify"). `/api/restaurants` goes through the same offers service and 10-minute cache in all three. |
| `ADAPTER_<PLATFORM>` | unset | Per-platform override of `ADAPTER` (same values). `ADAPTER_GRUBHUB=live` scrapes Grubhub with the local Playwright adapter (it needs no Apify actor) while `ADAPTER=apify` keeps DoorDash and Uber Eats on actors. `GET /api/health` reports the resolved mode per platform. |
| `PORT`        | `4000`  | |
| `SCRAPER_*`   |         | Playwright scraper knobs, listed under "Live scraping". |
| `APIFY_TOKEN`, `APIFY_<PLATFORM>_*` | | Adapter-layer Apify token / actor ids, listed under "Collecting through Apify". Separate from the deals-feed vars below. |
| `APIFY_API_KEY` | unset | Apify token for the deals feed. Sent in an Authorization header only, never in a URL or a log line. |
| `DEALS_LIVE_RUNS` | `0` | **Master switch for spending credit.** Off unless set to `1`; no actor run can start without it. Reads, ingests and every endpoint work regardless. |
| `APIFY_WEBHOOK_SECRET` | unset | Shared secret Apify sends back on the run-finished webhook. |
| `CRON_SECRET` | unset | Bearer token Vercel Cron sends to `/api/apify/reconcile`. |
| `API_PUBLIC_URL` | unset | Public URL of this API, used to build the webhook URL passed to Apify. |
| `DEALS_CONFIG_PATH` | `apps/api/deals.config.json` | Override the deals configuration file. |

## Endpoints

All under `/api`. Money is in dollars, times in minutes, dates ISO-8601.

### `GET /api/health`
`{ ok, adapter: "mock"|"live"|"apify", store: "mongo"|"memory", time }`

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
  deals/           Apify deals layer: config, REST client, cost guard, providers,
                   ingest, jobs, scoring, fixtures (+ tests)
  deals.ts         `npm run deals` CLI
api/index.ts       Vercel serverless entry (same Express app as server.ts)
deals.config.json  addresses, feed queries, spend caps, actor ids, ranking weights
docs/apify-setup.md  creating the schedules and webhook in the Apify console
```

## Deals feed (Apify)

A second, separate data source from the Playwright scrapers below: **DoorDash
promos collected through an Apify actor**, on a schedule, into MongoDB. The API
only ever reads the database, so no request waits on Apify.

- **Feed**: four scheduled runs a day (08:00, 12:30, 17:30, 22:00 America/New_York)
  over a preset cuisine list, populating the front page for web and mobile.
- **Search**: `POST /api/deals/search` answers from the database immediately and
  starts one background refresh for that query if the budget allows.

Configuration lives in `apps/api/deals.config.json` (addresses, cuisine list,
spend caps, actor id and pricing, ranking weights). Secrets stay in env:
`APIFY_API_KEY`, `APIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `API_PUBLIC_URL`.

> **Nothing spends credit unless `DEALS_LIVE_RUNS=1`.** It is off by default, so
> a local run, a stray request or a fresh deploy cannot start an actor. The CLI
> exposes it as `--live`.

### Commands

```bash
npm run deals -- --status                        # runs, active deals, credit burned
npm run deals -- --feed --dry-run                # the exact actor input, starts nothing
npm run deals -- --fixture src/deals/__fixtures__/doordash-search.json   # parse a fixture into the DB
npm run deals -- --ingest-run <apifyRunId>       # ingest a run that already happened (free)
npm run deals -- --dump-run <apifyRunId> --out <file>   # save a finished run as a fixture (free)
npm run deals -- --reconcile                     # pick up runs whose webhook never arrived
npm run deals -- --feed --live                   # start the feed for real (COSTS CREDIT)
npm run deals -- --q "primanti bros" --live      # start a search run (COSTS CREDIT)
```

### Endpoints

| endpoint | what it does |
|---|---|
| `GET /api/deals` | active deals for an address, ranked; filter by `platform`, `type`, `maxDistance`, `q`, `limit` |
| `POST /api/deals/search` | database answer now, background refresh if the budget allows |
| `GET /api/deals/jobs/:id` | poll one background refresh |
| `GET /api/deals/runs` | run history, spend, remaining budget, configured caps |
| `POST /api/apify/webhook` | Apify's run-finished callback, shared-secret authenticated |
| `GET /api/apify/reconcile` | Vercel Cron backstop for missed webhooks |

### Cost control

Every run passes one cost guard, which enforces a per-run result cap, a
cumulative spend ceiling, daily feed and search caps over a rolling 24 hours,
and in-flight deduplication. Refusals are recorded as `skipped` rows in
`scrapeRuns`, so the ledger shows what was chosen *not* to run and why.

Setting up the schedules and the webhook in the Apify console:
**`docs/apify-setup.md`**.

## Collecting through Apify

`ADAPTER=apify` swaps the local browsers for [Apify](https://apify.com) actors: the crawling,
proxy rotation and anti-bot handling happen on Apify's infrastructure and this app only consumes
the resulting dataset. Same `PlatformAdapter` contract, same matcher, same `computeTotal`, so
nothing downstream changes — and it is the answer to the 403s that DoorDash and Uber Eats return
from any datacenter IP.

Trade-offs versus `ADAPTER=live`: runs cost Apify credit and take tens of seconds to a few minutes,
and you get whatever fields the actor's author chose to emit — often no service fee or tax, since
those are checkout-only. Missing fee lines stay `0` rather than being invented, exactly as in the
Playwright path.

### Setup

1. Create an account and copy the token from
   [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations).
2. Pick an actor per platform on [apify.com/store](https://apify.com/store?search=doordash)
   (also search `ubereats`, `grubhub`). The actor id is the `username/actor-name` from its URL.
   Two things to check on its page before you commit to it:
   - it can **search by address or location**, not only scrape store URLs you supply — otherwise it
     can serve as a `_STORE_ACTOR` but cannot do discovery;
   - its output includes **menu items with prices**, so one run prices a whole search
     (see "Run accounting").
3. Fill in the repo-root `.env`:

```bash
ADAPTER=apify
APIFY_TOKEN=apify_api_...
APIFY_DOORDASH_ACTOR=someone/doordash-scraper
APIFY_UBEREATS_ACTOR=someone/ubereats-scraper
APIFY_GRUBHUB_ACTOR=someone/grubhub-scraper
```

#### Uber Eats: `borderline/uber-eats-scraper-ppr`

This is the actor the project uses, and its input templates are the **built-in defaults** for
`ubereats` — setting `APIFY_UBEREATS_ACTOR` is enough:

```bash
APIFY_UBEREATS_ACTOR=borderline/uber-eats-scraper-ppr
# equivalent to the defaults in src/adapters/apify/actors.ts:
APIFY_UBEREATS_INPUT={"query":"{{query}}","address":"{{address}}","latitude":"{{lat}}","longitude":"{{lng}}","addressCountry":"US","locale":"en-US","diningMode":"DELIVERY","storeType":"RESTAURANTS","maxRows":"{{limit}}","getMenuCustomizations":false}
APIFY_UBEREATS_STORE_INPUT={"urls":["{{storeUrl}}"],"locale":"en-US","diningMode":"DELIVERY","getMenuCustomizations":false}
```

It bills **$0.005 per restaurant**, and one row is one restaurant with its menu nested — so a
search costs `APIFY_MAX_ITEMS` × half a cent (8 stores ≈ $0.04) no matter how long the menus are.
Notes on the template:

- coordinates override the address string on this actor, so `{{lat}}`/`{{lng}}` (the zip centroid
  from `services/zipGeo.ts`) pin the delivery point better than "Pittsburgh, PA 15213" does. When
  a zip has no geocode both keys drop out and `address` carries the search on its own.
- `storeType: RESTAURANTS` keeps grocery, pharmacy and retail verticals out of the results.
- `getMenuCustomizations` stays off: option trees multiply the run time and payload without
  changing any price we read.
- store lookups use URL mode (`urls`), but they rarely run — the search rows already carry menus.

Platforms without an actor id fail with a message naming the exact var to set; the others still run.

```bash
npm run scrape:apify -- --zip 15213 --q ramen --platforms doordash,ubereats
npm run scrape -- --adapter apify --zip 15213 --q pizza --json
ADAPTER=apify npm run dev        # /api/restaurants and POST /api/scrape go through Apify
```

### Using it from the web app

Prices are **collected by a scrape and served from storage** — `GET /api/restaurants` never starts
an actor run. A run takes tens of seconds to minutes, and the web client gives up on a request after
2.5 s and falls back to its sample data, so an on-demand run could not reach the UI anyway; it would
just spend credit (one run per restaurant per page load). `config.apify.storedOnly` enforces that;
set `APIFY_STORED_ONLY=0` if you really want the old on-demand behaviour.

So the working order is:

```bash
ADAPTER=apify npm run dev                                   # terminal 1
curl -X POST localhost:4000/api/scrape \
  -H 'content-type: application/json' \
  -d '{"zip":"15213","q":"pizza","platforms":["ubereats","doordash"],"limit":8}'   # terminal 2
```

then load the web app. **`npm run scrape:apify` does not work for this** unless `MONGODB_URI` is
set: without Mongo the CLI and the server each hold their *own* in-memory store, so a CLI scrape
fills a store the server never sees. Either set `MONGODB_URI`, or drive the scrape through
`POST /api/scrape` on the running server.

### Seeding the database with real prices

`npm run scrape:seed` fills the store from real searches instead of the demo catalog: one scrape
job per (zip, query) — sequentially, reusing the browsers and Apify caches — plus the platform
metadata docs (names, brand colors), so a fresh database is fully usable afterwards. Defaults to
eight common searches (pizza, boba, fast food, burgers, sushi, chinese, mexican, thai) near 15213.

```bash
npm run scrape:seed                                          # the defaults; needs MONGODB_URI
npm run scrape:seed -- --zips 15213,15217 --queries pizza,boba --limit 5 --pause 10
```

Each query starts one Apify search run per apify-mode platform; the total is printed before
anything runs. Ctrl-C finishes the current job and exits cleanly.

A stored price stays servable for `APIFY_OFFER_MAX_AGE_MIN` (default 24 h) rather than the 10-minute
cache the other adapters use, because re-collecting costs a run. Platforms with no stored price come
back in `unavailable[]` and the ledger shows them as not priced, so a restaurant that only one
platform returned still renders with its one real price:

```
Andaluzia Flavors          DoorDash  $19.80      Uber Eats  —      Grubhub  —
Ottimo Pizza & Pasta       Uber Eats $23.68      DoorDash   —      Grubhub  —
```

That is the normal case across platforms here, not an error: the matcher only joins rows it can
identify as the same physical restaurant, and the platforms rank and paginate their own search
results differently, so the two actors often surface different stores for the same query.

### Actor input templates

Every actor takes a different input. The defaults in `src/adapters/apify/actors.ts` cover the
common `{search, location, maxItems}` / `{startUrls}` shapes; when yours differs, open the actor in
the Apify console, run it once by hand, switch the Input tab to **JSON**, and paste that JSON into
`APIFY_<PLATFORM>_INPUT` with placeholders where the app should fill in:

| template | placeholders |
|----------|--------------|
| `APIFY_<PLATFORM>_INPUT` (search) | `{{query}}` `{{zip}}` `{{address}}` `{{lat}}` `{{lng}}` `{{limit}}` |
| `APIFY_<PLATFORM>_STORE_INPUT` (one store) | `{{storeId}}` `{{storeUrl}}` `{{zip}}` `{{address}}` `{{lat}}` `{{lng}}` `{{item}}` |

Append `:uri` to percent-encode a placeholder that sits inside a URL — `{{query:uri}}` turns
`chicken tikka` into `chicken%20tikka`, which is what actors taking `startUrls` need.

```bash
APIFY_UBEREATS_INPUT={"searchTerm":"{{query}}","deliveryAddress":"{{address}}","maxRows":"{{limit}}"}
```

Keep placeholders quoted so the template stays valid JSON — a string that is *exactly* one
placeholder keeps the value's own type, so `"{{limit}}"` renders as the number `20`. Keys whose
placeholder has no value (an unused `{{item}}`) are dropped before the run. `{{address}}` is the
zip's geocoded label ("Pittsburgh, PA 15213") from `services/zipGeo.ts`, since most actors want a
human address rather than a bare zip.

#### DoorDash: `dz_omar/doordash-scraper`

Also wired as the default for `doordash` — the actor id alone is enough. It takes **URLs, not a
query**, so discovery is a search page and store lookups are store pages, and — crucially — it
takes a real delivery **`address`**, so results, fees and ETAs are for the requested zip
(`{{address}}` is the geocoded "Pittsburgh, PA 15213" label, verified to return Oakland stores):

```bash
APIFY_DOORDASH_ACTOR=dz_omar/doordash-scraper
# equivalent to the defaults:
APIFY_DOORDASH_INPUT={"startUrls":[{"url":"https://www.doordash.com/search/store/{{query:uri}}?event_type=search"}],"address":"{{address}}","maxResults":"{{limit}}","includeMenu":true,"fetchReviews":false}
APIFY_DOORDASH_STORE_INPUT={"startUrls":[{"url":"{{storeUrl}}"}],"address":"{{address}}","includeMenu":true,"fetchReviews":false}
```

Billing is **pay-per-event: $0.006 per store record** on the free tier (cheaper on paid tiers).
Reviews cost extra per row and nothing here reads them, so `fetchReviews` stays `false`.

Each row is one store (`record_type: "store"`) with the menu nested on it —
`menu_categories[].items[]` plus a `featured_items` carousel of the store's own dishes — so one
search run prices every store it returns; `fetchOffer` needs no second run. Items carry both
`price_cents` (list price) and `price_display` (with the store's "25% off"-style discount already
applied); the profile pins `price_display` first because that is what a customer actually pays.
The delivery fee is read from the tile string (`"$0 delivery fee, first order"`), and `tags`
become the cuisines. No hooks needed — this actor is handled by aliases alone
(`DZ_OMAR_DOORDASH` in `src/adapters/apify/profiles.ts`).

### Adding a platform whose actor looks nothing like the others

Output shape follows the **actor**, not the platform: swap the DoorDash actor and its field names
change again, while two platforms scraped by the same author usually look alike. So parsing
overrides are registered per actor id, in `src/adapters/apify/profiles.ts`, and resolved as
`APIFY_<PLATFORM>_PROFILE` → a profile whose name matches the configured actor id → generic.

Most actors need **no profile** — the alias vocabulary in `apify/fields.ts` already covers them.
Run the actor once, look at what came out wrong, and reach for the cheapest fix that works:

| Symptom | Fix |
|---|---|
| A field is empty, or picked up the wrong key | `fields` — add the actor's key names |
| Every dish became its own restaurant; the dataset is wrapped or padded | `rows` — reshape before anything reads it |
| A value needs real logic, not a key name | `listing` / `menu` / `fees` hooks |

```ts
export const SOMEONE_DOORDASH: ApifyProfile = {
  name: 'someone/doordash-scraper',        // the actor id
  fields: {
    storeId: ['!', 'ddStoreId'],           // '!' replaces the defaults …
    deliveryFee: ['deliveryFeeString'],    // … without it, tried before them
    menuContainers: ['!', 'menuBook'],
    itemName: ['!', 'itemTitle'],
  },
  rows: (rows) => rows.filter((r) => r.kind === 'store'),
  menu: (row, ctx) => myCustomMenuReader(row),   // return undefined to fall through
};
```

Then add it to `PROFILES`. `'!'` matters when a generic alias actively means the *wrong* thing on
that actor — one real example: a DoorDash row where `name` is the chain ("Papa Johns") and
`storeDisplayName` is the branch, or `rating` holds a review count rather than a score. Prepending
would leave the generic name winning; replacing fixes it. The hooks all return `undefined` to
decline, so a profile can special-case a few rows and let the generic reader handle the rest.
`profiles.test.ts` works an example of each.

Everything shared — money and cents handling, ETA, addresses, menu walking, flat-row joining —
stays in the generic layer, so a profile is only ever an exception list, usually under ten lines.

### Reading the output

Actor output field names vary per actor and change between versions, so
`src/adapters/apify/normalize.ts` resolves each field from a list of aliases (shallow keys first,
then a bounded walk), which covers `title`/`name`/`storeName`, `delivery_fee`/`deliveryFee`/
`fees.delivery`, menus under `menuItems` or `categories[].items[]`, prices as `16.5`, `"$16.50"` or
`{amount: 1650, currencyCode: "USD"}`, and stores identified only by their URL. `normalize.test.ts`
pins that against three deliberately different shapes.

**Prices in cents.** Uber Eats reports menu prices as integer cents (`price: 1799` alongside
`priceTagline: "$17.99"`), and actors pass that straight through — so a bare number is ambiguous.
The formatted string wins whenever there is one. When there isn't, the scale is decided for the menu
as a whole rather than per value: if any item has both forms their ratio settles it, otherwise a menu
where every item is ≥ 100 and something is ≥ 1000 is treated as cents. `detectPriceScale` is the
function, and `normalize.test.ts` pins both paths.

**Catalog vocabulary.** Actors that pass Uber's own structure through nest items under
`menu[].catalogItems[]` with `title`/`priceTagline`, put the rating in an object
(`rating: {ratingValue: 4.5, ratingCount: "140+"}`) and put the delivery fee in a badge string
(`fareBadge: " $0 delivery fee (new users)"`). All three are handled; the fixture in
`fixtures/ubereats-catalog.json` is a real capture. Note that item-level promos ("Buy 1, get 1
free" on one dish) are deliberately *not* read as order promos — only the store-level
`promotions` / `offerText` fields are.

**Flat datasets.** Some actors do not nest the menu inside the store; they emit one row per store
*and* one row per menu item, tagged `recordType: "store" | "menuItem"` and joined by `storeId` /
`storeUrl` (`solidcode/ubereats-full-menu-scraper` is one). `joinFlatRows` folds the item rows back
into their store before anything else looks at them — without it every dish becomes its own
restaurant. Rows with no `recordType` are classified by shape: a price plus a store key, minus the
fields only a store has (address, cuisines, rating, delivery fee). Item rows whose store row never
appeared (a `startUrls` run) synthesise one from their own `storeName` / `storeUrl`.

That is also why `APIFY_MAX_ITEMS` is *not* passed to Apify as a row cap — it is the store count
rendered into the input as `{{limit}}`. A row cap would truncate a flat dataset mid-menu. Set
`APIFY_HARD_MAX_ITEMS` if you want one anyway as a spend backstop.

When rows come back but none parse as a store, the run fails with the keys the actor actually sent:

```
doordash: someone/doordash-scraper returned 20 rows but none had a store name + id.
First row keys: shopTitle, shopUrl, shopRating, …
```

— which is your cue to point `APIFY_<PLATFORM>_INPUT` at a different actor or adjust the template.

### Run accounting

A scrape job calls `searchRestaurants` once per platform, then `fetchOffer` once per matched
restaurant. Since each actor run is billed, `ApifyAdapter` caches the search rows and prices from
them whenever they carried a menu — so a typical search is **one run per platform**, not one per
restaurant. Only stores whose search row had no menu trigger a single-store run through
`APIFY_<PLATFORM>_STORE_ACTOR` (defaults to the search actor), and that result is cached too.

| env | default | |
|-----|---------|---|
| `APIFY_TOKEN` | unset | Required for `ADAPTER=apify`. |
| `APIFY_<PLATFORM>_ACTOR` | unset | `username/actor-name`. Platforms without one report an error and are skipped. |
| `APIFY_<PLATFORM>_STORE_ACTOR` | search actor | Separate actor for single-store/menu runs. |
| `APIFY_<PLATFORM>_INPUT` / `_STORE_INPUT` | see above | Input templates, as JSON. |
| `APIFY_<PLATFORM>_PROFILE` | by actor id | Force a parsing profile by name; `generic` disables per-actor overrides. |
| `APIFY_MAX_ITEMS` | `20` | Stores wanted per search run, rendered into the input as `{{limit}}`. |
| `APIFY_HARD_MAX_ITEMS` | off | Row cap enforced by Apify. Off by default — it truncates flat datasets mid-menu. |
| `APIFY_TIMEOUT_SEC` | `180` | Per-run timeout. Above Apify's 300 s sync cap the client starts the run and polls instead. |
| `APIFY_ASYNC` | `0` | `1` forces the run + poll path at any timeout. |
| `APIFY_MEMORY_MB` | actor default | Memory per run. |

```
src/adapters/apify.ts            the adapter (search -> listings, fetchOffer -> Offer, run cache)
src/adapters/apify/client.ts     REST client: run-sync-get-dataset-items, or run + poll + fetch dataset
src/adapters/apify/actors.ts     actor ids and input templates from env, placeholder rendering
src/adapters/apify/fields.ts     every field the normalizer reads + the key names accepted for it
src/adapters/apify/profiles.ts   per-actor overrides: field aliases and listing/menu/fees/rows hooks
src/adapters/apify/normalize.ts  actor output (any shape) -> PlatformListing / menu / fees
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

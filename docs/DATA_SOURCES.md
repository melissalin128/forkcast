# Data sources

What is actually in the `forkcast` database, as counted live on
**2026-09-12 18:16 UTC**. Every figure below was read from the database, not
from an ingest log. `npx tsx src/ingest/dbBreakdown.ts` re-counts the source
splits; `npx tsx src/ingest/reconcileProvenance.ts` (dry run) re-derives the
provenance labels.

The short version: the catalogue is a one-day Apify scrape of DoorDash and Uber
Eats listings in Pittsburgh. 207 of its restaurants were first found in
Allegheny County open data and still carry those county fields; the county
tables themselves were purged. `menuItems` is entirely observed. `offers` and
`priceSnapshots` are **not**: the running API writes modelled mock-adapter rows
into both whenever it prices a restaurant, so both mix observed and modelled
rows and keep growing. None of the scraped data is redistributable.

## What is in the database

Totals: 79.56 MB data, 29.02 MB storage, 20.79 MB indexes, 70,416 objects.

| Collection | Rows | Data | Indexes | Where the rows came from |
|---|---|---|---|---|
| `platformScrapes` | 719 | 54.22 MB | 0.39 MB | Raw Apify actor output, one document per store. 419 DoorDash + 300 Uber Eats, 719 distinct `storeId`, all `capturedAt` 2026-09-12T16:00Z. 68% of the database by size (~79 KB/doc). Write-only provenance archive — nothing reads inside `payload`. |
| `menuItems` | 64,278 | 23.58 MB | 16.59 MB | Menu rows parsed out of those scrapes by `src/ingest/apifyPlatforms.ts`. **All 64,278 are `synthetic: false`** — observed listings, 39,042 `observedPlatform: doordash` / 25,236 `ubereats`, across 644 restaurants (avg 100 items, max 418). Prices have a units bug, see below. |
| `offers` | 3,285 | 0.97 MB | 0.37 MB | Two writers. **715** from the apify stage (`fetchedAt` 16:00Z, 713 restaurant×platform pairs; it uses `create()`, so 2 are repeats). **2,570 modelled**: on a 10-minute cache miss, `services/offers.ts` `getOffer()` prices a restaurant through `src/adapters/mock.ts` (`ADAPTER=mock`) and saves the result — 619 rows at each of 17:10, 17:23 and 17:34Z, 713 at 18:03Z. This grows every time the API serves restaurants. |
| `priceSnapshots` | 1,426 | 0.24 MB | 0.26 MB | **713 observed-scrape** rows from the apify stage at 16:00Z: `source` `apify-doordash` 414 / `apify-ubereats` 299. **713 `modelled`** rows at 18:03Z from the same `getOffer()` mock path (`appendSnapshot()` sets no `source`, so the schema default `modelled` applies). `purgeToCollected.ts` removed the earlier mock rows; these were written after it and will keep accumulating. |
| `restaurants` | 655 | 0.52 MB | 2.59 MB | Matched store listings. `source`: `apify-doordash` 237, `apify-ubereats` 211, `wprdc` 207 — see "Observed vs. derived". 414 carry a DoorDash store id, 299 an Uber Eats one, 58 both, 0 Grubhub. |
| `deals` | 41 | 0.03 MB | 0.14 MB | A separate DoorDash deals feed: 34 from Apify runs `UWkf08juKUqru4cdK` / `8jpBahEoCfcY6s1ly` (`isActive: true`), 7 from a checked-in fixture (`fixture:doordash-search.json`, all `isActive: false`). All `platform: doordash`. **No code in this repo writes this collection** — it arrives from a pipeline outside `apps/api`. |
| `scrapeRuns` | 2 | 0.00 MB | 0.14 MB | Run bookkeeping for that same deals feed: actor `dz_omar/doordash-scraper` (search "pizza", $0.24) and actor id `dACRyoaWVcMPGRZ7R` (feed, $0.432). Also written from outside this repo. |
| `platforms` | 3 | 0.00 MB | 0.07 MB | Hand-written platform metadata (name, brand colour, subscription perks) for doordash / ubereats / grubhub. Not observed; copied from public marketing pages. |
| `promos` | 7 | 0.00 MB | 0.14 MB | Hand-written demo promo codes (`WEEKNIGHT20` etc.). Invented. Never present as real platform offers. |
| `foodFacilities` | 0 | — | 0.04 MB | Emptied by the WPRDC purge. Index shell only. |
| `inspections` | 0 | — | 0.03 MB | Emptied by the WPRDC purge. |
| `violations` | 0 | — | 0.03 MB | Emptied by the WPRDC purge. |
| `users` | 0 | — | — | Never populated. |

## How the platform data was collected

Via paid **Apify Store actors**, run once, driven by
`src/ingest/apifyPlatforms.ts` (`npm run ingest -- --only apify --doordash-dataset <id> --ubereats-dataset <id>`).
These are the distinct values in `platformScrapes.actor`:

| Actor | Platform | Scrape docs | What it returns |
|---|---|---|---|
| `dz_omar/doordash-scraper` | DoorDash | 419 | Store record: rating, review counts, price range, `delivery_fee_display`, `asap_minutes`, address/geo, cover images, `menu_categories` with item names, descriptions and prices |
| `borderline/uber-eats-scraper-ppr` | Uber Eats | 300 | Store record: `rating`, `etaMinutes`, `deliveryFee`, `cuisineList`, `location`, `heroImageUrl`, `menu[].catalogItems[]` with `price` and `priceTagline` |

Coverage is Pittsburgh and near suburbs: 57 distinct zips in `platformScrapes`,
55 on `restaurants`, concentrated in 15213 (103 restaurants), 15217 (56),
15203 (46), 15222 (42), 15206 (41).

`src/adapters/` collected none of the scraped data, and its Playwright adapters
are not used. Its **mock** adapter is, however, the source of every modelled
`offers` and `priceSnapshots` row above.

## Licensing and terms

This data was scraped from DoorDash and Uber Eats, whose terms of service
prohibit scraping. It is fine to keep for a hackathon demo. It is **not**
redistributable, must not be republished as a dataset, and must not ship in a
public product. A production Forkcast needs either the partner APIs below or a
licence-clean catalogue.

## Observed vs. derived

Observed (parsed straight out of the actor payload): restaurant name, zip,
rating count, hero/cover image URL, phone (290 rows), platform store id and
deep link; address and geocode on the 448 `apify-*` rows; ETA (13 of the 713
scrape snapshots equal the parser's 35-minute default, so those may not be);
rating, price tier and cuisine except where the parser defaulted (below); and
every `menuItems` row — name, description (53,259 of 64,278), category, price,
dietary tags (1,760).

**Not observed: the delivery fee.** `parseMoney(...) ?? 0` stores 0 when the
actor's fee is unparsable, and 712 of the 713 scrape snapshots hold 0 (max
$0.99). A 0 there means "not read", not "free delivery".

Derived guesses are meant to be listed per row in `restaurants.derivedFields`.
Measured distribution today:

| `derivedFields` value | Restaurants |
|---|---|
| `[]` — nothing derived | 448 |
| `["rating","ratingCount","priceTier","sampleItem","imageUrl"]` | 160 |
| the same plus `"cuisine"` | 47 |

That list is wrong in both directions.

**The 207 `source: 'wprdc'` rows (the 160 + 47).** The `source` label is
accurate: all 207 still carry `facilityId`, address, geocode, neighborhood and
last inspection placard from Allegheny County (CC0), 197 a `seatCount`, 33 a
`sqFeet`. The platform match added store ids and overwrote only rating,
rating count, image URL, phone and sample item, and appended cuisine tags.
So their `derivedFields` over-reports for `imageUrl` and `sampleItem` (observed
on all 207), `rating` (observed on 189) and `ratingCount` (observed on 202).
Still genuine guesses: `priceTier` on **all 207** (the match never writes it),
`rating` on 18, `ratingCount` on 5, `cuisine` on 47 (a name-regex guess mixed
with platform tags, undecidable).

**The 448 `apify-*` rows** say `[]`, but the parser filled some values from a
default rather than the payload: `rating` 4 on 29 rows (no rating in any linked
payload), `priceTier` 2 on 136 (no parsable price range from the creating
platform), `cuisine: ["American"]` on 11.

`npx tsx src/ingest/reconcileProvenance.ts [--apply]` corrects both: it drops
only the labels it can prove stale, adds the parser defaults, records the
platforms with evidence in a new `observedOn` field, and leaves `source` alone.
After `--apply`: `rating` 47, `ratingCount` 5, `priceTier` 343, `cuisine` 58,
`imageUrl` 0, `sampleItem` 0. **It has not been applied** — `observedOn` is
empty on every row.

Other things that are computed rather than observed, and matter because they
look like prices:

| Field | Reality |
|---|---|
| `offers.serviceFee` | `subtotal * 0.12` on the 715 apify rows; the mock adapter's per-platform profile on the other 2,570. Invented either way. |
| `offers.tax` | `subtotal * 0.07`, invented (verified: all 3,285 rows). |
| `offers.total` and `priceSnapshots.total` | Apify rows: subtotal + delivery fee (0, see above) + those two invented fees — a representative-item total, **not** a checkout total. Modelled rows: mock-adapter output end to end. |
| `offers.smallOrderFee` | 0 on all 715 apify rows. The 349 non-zero values are all mock-adapter rows. |
| `priceSnapshots.promoApplied` | Apify rows: just `deliveryFee === 0`, so true on 712 of 713 — an artefact of the unread fee. False on all 713 modelled rows. |
| `menuItems.platformPrices` | Observed, keyed by platform: 39,042 DoorDash, 30,291 Uber Eats, 0 Grubhub. On the 58 restaurants listed on both platforms, 5,055 items share a name across the two menus and carry both prices; checked against both payloads, all 5,055 match. On those rows `observedPlatform` names only the last writer (DoorDash), which also supplied description, category and `basePrice`. That is the **only** cross-platform price comparison in the data: matched by exact item name, 4,064 of the pairs identical, and subject to the cents artefact below. |
| `restaurants.imageUrl` | A ~164-byte URL string on 653 of 655 rows (411 `img.cdn4dd.com`, 242 `tb-static.uber.com`). There is no binary image data anywhere in the database. |

`GET /api/restaurants/:id/history` drops partner-API rows but still returns
apify and modelled snapshots in one series; each row carries its `source`.

### Known artefact: cent prices

Uber Eats returns integer cents (`price: 738`, `priceTagline: "$7.38"`).
`parseMoney()` in `src/ingest/apifyPlatforms.ts` only divides by 100 when the
value is an integer **above** 1000, so anything up to and including $10.00
was stored as its cent value. **25,901 menu rows (15,390 DoorDash, 10,511 Uber
Eats) hold an integer `basePrice` from 100 to 1,000 inclusive** (445 of them
exactly 1000, i.e. $10.00) and are almost certainly cents. The 85 values above
1000 are all non-integers. That is roughly 40% of the menu table, and it feeds
`sampleItem`, `offers.subtotal` and `priceSnapshots.total` on the apify rows
(max 1,188.81). `GET /api/restaurants/:id/menu` repairs it at read time
(`dollars()` in `src/repo/mongo.ts`); nothing else does. Fix the parser before
trusting any aggregate price.

## Open data — available, not currently loaded

The licence-clean sources this project used to run on are no longer loaded as
tables (only the county fields on the 207 `wprdc` restaurant rows remain), but
the ingest modules are still in `src/ingest`, working and idempotent:

| Source | Licence | Module | State |
|---|---|---|---|
| WPRDC / Allegheny County food facilities, inspections, violations (CKAN datastore) | CC0 | `wprdcFacilities.ts`, `wprdcInspections.ts`, `wprdcViolations.ts` | **Not loaded.** `foodFacilities` / `inspections` / `violations` are empty. |
| OpenStreetMap food POIs via the public Overpass API | ODbL, attribution required | `osm.ts` | **Not loaded.** 0 restaurants have an `osmId`. |

Run `npm run ingest -- --only facilities,inspections,violations,osm` to rebuild
a catalogue that can actually be shipped. If OSM is reloaded, any surface
showing its cuisine, dietary tags, hours, phone or website must carry
**"© OpenStreetMap contributors"**.

`menus.ts` and `snapshots.ts` (the synthetic menu and modelled price-history
generators) are also still present and still wired into the default ingest
order. Nothing they wrote survives in the database. If you run a plain
`npm run ingest`, they will put synthetic rows back.

## Official partner APIs — the supported route to live fees

| API | Endpoint | Auth | Returns |
|---|---|---|---|
| DoorDash Drive | `POST /drive/v2/quotes` | JWT, HS256 + DD-JWT-V1 | `fee`, `currency`, pickup/dropoff time estimates |
| Uber Direct | `POST /v1/eats/deliveries/estimates` | OAuth2 client_credentials, scope `eats.deliveries` | `delivery_fee.total`, line items, `etd` |

`src/ingest/liveQuotes.ts` contains request code for both, quoting against four
real Pittsburgh dropoffs. **It has never run with credentials** — zero rows
carry either source — so treat it as unverified. Credentials are optional and
live in the repo-root `.env` (`DOORDASH_DEVELOPER_ID`, `DOORDASH_KEY_ID`,
`DOORDASH_SIGNING_SECRET`, `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`;
`UBER_CUSTOMER_ID` is listed but nothing reads it); with none set the stage logs
a skip and the rest of the ingest runs normally. Run it with
`npm run ingest -- --only livequotes`.

Both endpoints quote the *logistics* fee for a delivery you originate from a
store you operate. Neither returns the consumer marketplace checkout total at a
restaurant you do not own — no platform offers an API for that. The Uber call
passes the restaurant's scraped marketplace store UUID as `pickup.store_id`,
which only makes sense for a store linked to your own Direct account. So at
best these give a real fee-and-ETA anchor, not menu prices or what a customer
pays, which is why their snapshots are tagged `doordash-drive` / `uber-direct`
and excluded from the price-over-time series in `repo.listSnapshots()`.

# Deals fixtures

Raw Apify dataset output, saved so parsers are developed and tested without
spending credit. Development iterates on these files, never on live runs.

| file | actor | provenance |
|------|-------|------------|
| `doordash-search.json` | `dz_omar/doordash-scraper` | Real output from run `UWkf08juKUqru4cdK` (search "pizza", address `5500 Walnut St, Pittsburgh, PA 15232`, 40 stores, 2026-09-12). Trimmed from 3.6 MB to the 6 stores that between them carry every badge type the run produced, plus one record with no `store_id` to pin down tolerant parsing. Store fields are verbatim; menu categories keep the badged items plus one plain item. |

## What the real output taught us

The actor's documented output schema and what it actually returns differ in
ways that matter, which is the whole reason parsers are built against a
fixture rather than against the docs:

- **Item badges are the deal signal.** `menu_categories[].items[].badges[]` and
  the featured carousel carry `{text, type, placement}`, with semantic types:
  `bogo_offer`, `lunch_special_percent_off`,
  `affordable_meal_zero_delivery_fee_item`, `fios_offer`. Popularity badges
  (`most_liked_1..3`, "#1 Most liked") sit in the same array and are not offers.
- **`delivery_fee_display` is a trap.** Logged out, 39 of 40 stores read
  "$0 delivery fee, first order". That is a signup promo for the viewer, not a
  deal at that restaurant, and treating it as one would mark the whole feed
  free-delivery. The provider skips viewer-conditional fees.
- **No struck-through prices appeared.** `price_display` held a single amount on
  every item, so `item_discount` from a struck price never fired. The code path
  stays because the field is documented and costs nothing to support.
- **`tags[]` are cuisine labels**, not offers, in every record we saw.
- Addresses resolve correctly: 37 of 40 stores were in Pittsburgh, at 0.7 to
  2.0 miles from the configured address.

## Refreshing a fixture

Reading a dataset is free, so a fixture can be refreshed from a run that has
already happened without spending anything:

```bash
npm run deals -- --dump-run <apifyRunId> --out src/deals/__fixtures__/doordash-search.json
```

Starting a *new* run costs credit and needs `--live` (see `DEALS_LIVE_RUNS`).

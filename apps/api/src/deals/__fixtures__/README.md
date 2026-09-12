# Deals fixtures

Raw Apify dataset output, saved so parsers are developed and tested without
spending credit. Development iterates on these files, never on live runs.

| file | actor | provenance |
|------|-------|------------|
| `doordash-search.json` | `dz_omar/doordash-scraper` | **Schema-derived, not a live capture.** Hand-written from the actor's documented output schema (`store_id`, `name`, `url`, `lat`/`lng`, `delivery_fee_display`, `tags[].name`, `menu_categories[].items[].badges[].text`, `price_display`) so the provider could be written and tested before any run was approved. Replace it with the real dataset from the first approved validation run and re-run the tests: the parser tests are what tell us the actor's real shape differs from the documented one. |

Refresh a fixture from a run that already happened, without starting a new one:

```bash
npm run deals -- --dump-run <apifyRunId> --out src/deals/__fixtures__/doordash-search.json
```

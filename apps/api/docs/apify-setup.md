# Apify setup: the scheduled DoorDash deals feed

Everything here is done once, by hand, in the Apify console. Nothing in this
repo creates or edits Apify schedules.

The app never calls Apify at request time. Two things write deals to MongoDB:

- the **feed**, four scheduled runs a day, which populates the front page
- **search**, started by the API when a user searches for something

Both land in the `scrapeRuns` collection with their Apify run id, so the run
history and the credit burned are visible in `GET /api/deals/runs` or
`npm run deals -- --status`.

## Before you start

| what | where | why |
|---|---|---|
| Apify API token | `.env` as `APIFY_API_KEY`, and in Vercel's env vars | starting runs and reading datasets |
| A random secret | `.env` as `APIFY_WEBHOOK_SECRET`, and in Vercel | Apify sends it back so the webhook can reject strangers |
| Another random secret | `.env` as `CRON_SECRET`, and in Vercel | Vercel Cron authenticates to the reconcile route |
| The API's public URL | `.env` as `API_PUBLIC_URL`, and in Vercel | used to build the webhook URL passed to Apify |
| `DEALS_LIVE_RUNS=1` | **Vercel only** | the master switch. Without it nothing ever starts a run |

Generate the two secrets with `openssl rand -hex 24`. Keep `DEALS_LIVE_RUNS`
unset locally so development can never spend credit by accident.

## 1. Create the Actor task

1. Open **`dz_omar/doordash-scraper`** in the Apify Store and choose **Save as task**.
2. Name it `forkcast-doordash-feed-15232`.
3. Set the input to exactly what the app would send. Print it with:

   ```bash
   npm run deals -- --feed --address 15232 --dry-run
   ```

   which produces, without starting anything:

   ```json
   {
     "includeMenu": true,
     "fetchReviews": false,
     "startUrls": [
       { "url": "https://www.doordash.com/search/store/pizza?event_type=search" },
       { "url": "https://www.doordash.com/search/store/sushi?event_type=search" },
       { "url": "https://www.doordash.com/search/store/chinese?event_type=search" },
       { "url": "https://www.doordash.com/search/store/burgers?event_type=search" },
       { "url": "https://www.doordash.com/search/store/indian?event_type=search" },
       { "url": "https://www.doordash.com/search/store/thai?event_type=search" }
     ],
     "address": "5500 Walnut St, Pittsburgh, PA 15232",
     "maxResults": 6
   }
   ```

   `maxResults` is **per URL** on this actor, so six URLs at six each is the
   36-result run the cost guard is sized for. Raising it multiplies the cost by
   the number of queries.

To narrow the feed to stores that already have offers, open DoorDash in a
browser, apply its filters, and paste the resulting search URL into
`searchUrlTemplate` in `deals.config.json` with the query replaced by `{query}`.

## 2. Add the webhook to the task

On the task's **Integrations** tab, add a webhook:

- **Events**: Run succeeded, Run failed, Run aborted, Run timed out
- **URL**:

  ```
  https://<your-api-host>/api/apify/webhook?platform=doordash&address=15232&kind=feed&token=<APIFY_WEBHOOK_SECRET>
  ```

- **Payload template**: leave the default. The route trusts only the run id in
  it and re-reads the run from the Apify API.

The webhook is what turns a finished run into rows in the database. Without it
nothing breaks, it just gets slower: the daily reconcile sweep picks the run up
instead.

## 3. Create the four schedules

Four schedules, all in **America/New_York**, each running the task above.
Apify schedules take one cron expression each, so this is four entries rather
than one:

| name | cron | why this time |
|---|---|---|
| `forkcast-feed-morning` | `0 8 * * *` | before breakfast ordering |
| `forkcast-feed-lunch` | `30 12 * * *` | into the lunch peak |
| `forkcast-feed-dinner` | `30 17 * * *` | ahead of the dinner rush |
| `forkcast-feed-late` | `0 22 * * *` | late-night ordering |

Create them **paused** if you want to check the first run by hand first.

## 4. Point Vercel Cron at reconcile

`vercel.json` already declares it:

```json
"crons": [{ "path": "/api/apify/reconcile", "schedule": "0 9 * * *" }]
```

Vercel sends `Authorization: Bearer $CRON_SECRET`. On the Hobby plan crons run
at most once a day, which is fine: this is a backstop for a webhook that never
arrived, not the primary path.

## 5. Check it

```bash
npm run deals -- --status                 # runs, deals, credit burned
curl "$API_PUBLIC_URL/api/deals/runs"     # the same, as JSON
curl "$API_PUBLIC_URL/api/deals?address=15232&limit=5"
```

After the first scheduled run, `scrapeRuns` should hold a `feed` row with an
`apifyRunId`, an `actualCost`, and a non-zero `dealsExtracted`.

## What it costs

`dz_omar/doordash-scraper` bills per store returned: **$0.006** on the free
tier, with no per-run fee. Reviews are forced off in the input because they
bill separately and nothing reads them.

| | results | cost |
|---|---|---|
| one feed run | 36 | $0.216 |
| one search run | up to 40 | up to $0.240 |
| four feed runs a day | 144 | $0.864 |
| ten searches a day | up to 400 | up to $2.40 |

At the configured caps a full day costs about **$3.26**, so roughly $5 of credit
is a day and a half at full tilt. Two things stop it:

- **the spend ceiling** (`caps.spendCeilingUsd`, $5) halts every run once the
  recorded spend plus the next estimate would cross it, whatever the daily caps say
- **`DEALS_LIVE_RUNS`** must be on at all, anywhere that spends

Cheaper knobs, in `deals.config.json`: lower `caps.maxResultsPerRun`, shorten
`feedQueries`, or drop `caps.searchesPerDay`.

## Turning it off

Any one of these stops all spending:

- unset `DEALS_LIVE_RUNS` in Vercel and redeploy
- pause the four schedules in the Apify console
- set `caps.spendCeilingUsd` to `0` in `deals.config.json`

The API keeps serving whatever is already in the database.

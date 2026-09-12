# Forkcast

A delivery app that looks like DoorDash or Grubhub, except every restaurant
shows what the same order costs on **DoorDash, Uber Eats and Grubhub**, which
one is cheapest right now, and when it will be cheapest. Built for HackCMU 2026.

- `docs/PRODUCT_SPEC.md` — what we're building, decisions, data model, scraping plan
- `docs/DESIGN_SYSTEM.md` — colors, type, motion, components
- `design/` — design canvas artboards (landing, browse, compare, mobile)
- `src/` (repo root) — the Figma Make prototype; run with `pnpm dev` as before
- `apps/web` — Vite + React front end (three.js hero, anime.js price reveals)
- `apps/api` — Express + Mongoose API, platform adapters, seed data

## Run it

Each app installs on its own so the root Figma Make prototype keeps its
pnpm setup untouched.

```bash
npm install --prefix apps/api
npm install --prefix apps/web
cp .env.example .env          # fill in MONGODB_URI
npm run seed                  # loads restaurants + 7 days of price snapshots
npm run dev:api               # http://localhost:4000
npm run dev:web               # http://localhost:5173
```

With `ADAPTER=mock` the API serves seeded data and never touches the live
platforms. Without a `MONGODB_URI` the API falls back to an in-memory copy of
the seed so the front end still runs.

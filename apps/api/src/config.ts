import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

/**
 * Load environment from the repo-root .env first (apps/api/src -> ../../../.env,
 * and apps/api/dist -> ../../../.env both resolve to the monorepo root), then
 * fall back to a .env in the current working directory. Real credentials only
 * ever live in .env (git-ignored) and are read from process.env here.
 */
const rootEnv = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: process.env.MONGODB_URI?.trim() || undefined,
  adapter: (process.env.ADAPTER ?? 'mock').trim().toLowerCase(),
  /** Offers fetched from a platform are reused for this long before re-fetching. */
  offerCacheMs: 10 * 60 * 1000,
  /** Default tip used in every total (spec section 7 recommendation). */
  defaultTipPct: 0.15,
};

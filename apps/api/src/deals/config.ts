/**
 * Non-secret configuration for the deals layer, read from apps/api/deals.config.json
 * (override the path with DEALS_CONFIG_PATH). Addresses, feed queries, spend caps,
 * actor ids + pricing and ranking weights all live there so they can be tuned
 * without a code change. Secrets stay in env (see src/config.ts `apify`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { PLATFORM_SLUGS, type DealType, type PlatformSlug } from '../models/types';

const AddressSchema = z.object({
  /** Stable id used as Deal.addressKey and in URLs/CLI, e.g. "15232". */
  key: z.string().min(1),
  label: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  radiusMi: z.number().positive().default(3),
});

/** Per-actor pricing used for the pre-run cost estimate: perRun + perResult * maxResults + compute. */
const PricingSchema = z.object({
  perRunUsd: z.number().min(0).default(0),
  perResultUsd: z.number().min(0).default(0),
  computeUsdEstimate: z.number().min(0).default(0),
});

const ActorSchema = z.object({
  /** Apify actor id or "username/name". Empty = platform not wired up yet; jobs refuse to start. */
  actorId: z.string().default(''),
  pricing: PricingSchema.default({}),
  memoryMbytes: z.number().int().positive().optional(),
  timeoutSecs: z.number().int().positive().default(600),
  /** Static input merged into every run of this actor (proxy settings, toggles). */
  input: z.record(z.unknown()).default({}),
});

const CapsSchema = z.object({
  feedRunsPerDay: z.number().int().min(0).default(4),
  searchesPerDay: z.number().int().min(0).default(10),
  /** 0 = a search for the same query+address may start a new run any time (subject to the other caps). */
  searchCooldownHours: z.number().min(0).default(0),
  maxResultsPerRun: z.number().int().positive().default(40),
  spendCeilingUsd: z.number().positive().default(5),
  /** Deals not seen for this long are marked inactive by the staleness sweep after each ingest. */
  staleAfterHours: z.number().positive().default(36),
});

const dealTypeDefaults: Record<DealType, number> = {
  free_delivery: 4,
  reduced_delivery_fee: 2,
  percent_off: 5,
  dollar_off: 5,
  bogo: 8,
  item_discount: 3,
  promo_code: 4,
  other: 1,
};

const ScoreWeightsSchema = z.object({
  savings: z.number().default(1),
  deliveryFeePenalty: z.number().default(0.5),
  minOrderPenalty: z.number().default(0.05),
  distancePenaltyPerMi: z.number().default(0.4),
  unknownDistancePenalty: z.number().default(1),
  defaultSavingsByType: z
    .object(
      Object.fromEntries(
        (Object.keys(dealTypeDefaults) as DealType[]).map((t) => [t, z.number().default(dealTypeDefaults[t])]),
      ) as Record<DealType, z.ZodDefault<z.ZodNumber>>,
    )
    .default({}),
});

export const DealsConfigSchema = z.object({
  $comment: z.string().optional(),
  addresses: z.array(AddressSchema).min(1),
  feedQueries: z.array(z.string().min(1)).min(1),
  caps: CapsSchema.default({}),
  actors: z.object(
    Object.fromEntries(PLATFORM_SLUGS.map((p) => [p, ActorSchema.optional()])) as Record<
      PlatformSlug,
      z.ZodOptional<typeof ActorSchema>
    >,
  ),
  scoreWeights: ScoreWeightsSchema.default({}),
});

export type DealsConfig = z.infer<typeof DealsConfigSchema>;
export type AddressConfig = z.infer<typeof AddressSchema>;
export type ActorConfig = z.infer<typeof ActorSchema>;
export type ScoreWeights = z.infer<typeof ScoreWeightsSchema>;
export type DealsCaps = z.infer<typeof CapsSchema>;

/** apps/api/deals.config.json, from either src/deals or dist/deals. */
export const DEFAULT_DEALS_CONFIG_PATH = path.resolve(__dirname, '../../deals.config.json');

export function parseDealsConfig(raw: unknown): DealsConfig {
  return DealsConfigSchema.parse(raw);
}

export function loadDealsConfig(filePath: string = config.dealsConfigPath ?? DEFAULT_DEALS_CONFIG_PATH): DealsConfig {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`[deals] cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return parseDealsConfig(JSON.parse(text));
  } catch (err) {
    throw new Error(`[deals] invalid ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

let cached: DealsConfig | null = null;

export function getDealsConfig(): DealsConfig {
  cached ??= loadDealsConfig();
  return cached;
}

/** Test hook. */
export function setDealsConfig(cfg: DealsConfig | null): void {
  cached = cfg;
}

export function findAddress(cfg: DealsConfig, key: string): AddressConfig | undefined {
  return cfg.addresses.find((a) => a.key === key);
}

export function actorFor(cfg: DealsConfig, platform: PlatformSlug): ActorConfig | undefined {
  const a = cfg.actors[platform];
  return a && a.actorId ? a : undefined;
}

/** Pre-run cost estimate in USD for one run capped at `maxResults` results. */
export function estimateRunCost(actor: ActorConfig, maxResults: number): number {
  const p = actor.pricing;
  return round4(p.perRunUsd + p.perResultUsd * maxResults + p.computeUsdEstimate);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

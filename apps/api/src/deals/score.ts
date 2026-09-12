/**
 * The one place deals are ranked. The API sorts with this; the web and mobile
 * clients only render the order they are given.
 *
 *   score = savings
 *         - deliveryFeePenalty   * deliveryFee
 *         - minOrderPenalty      * minOrder
 *         - distancePenaltyPerMi * distanceMi     (unknownDistancePenalty when the actor gave no geo)
 *
 * `savings` is the dollar value when we could parse one, a percent applied to a
 * nominal order otherwise, and finally the per-type default from
 * deals.config.json. Weights live in config so they can be tuned without a deploy.
 */
import type { Deal, DealType, DealValue } from '../models/types';
import type { ScoreWeights } from './config';

/** Order size a percentage is scored against when the deal states no minimum. */
export const NOMINAL_ORDER_USD = 25;

/** Best dollar estimate of what this deal saves, or undefined when nothing is parseable. */
export function savingsUsd(value: DealValue | undefined, minOrder: number | undefined): number | undefined {
  if (!value) return undefined;
  if (value.dollars !== undefined) return value.dollars;
  if (value.originalPrice !== undefined && value.salePrice !== undefined && value.salePrice < value.originalPrice) {
    return round2(value.originalPrice - value.salePrice);
  }
  if (value.percent !== undefined) return round2((value.percent / 100) * (minOrder ?? NOMINAL_ORDER_USD));
  return undefined;
}

export interface ScoredDeal {
  savings: number;
  /** true when `savings` came from the per-type default rather than the deal itself. */
  savingsEstimated: boolean;
  score: number;
}

export function scoreDeal(
  deal: Pick<Deal, 'dealType' | 'value' | 'minOrder' | 'distanceMi'>,
  weights: ScoreWeights,
): ScoredDeal {
  const parsed = savingsUsd(deal.value, deal.minOrder);
  const savingsEstimated = parsed === undefined;
  const savings = parsed ?? defaultSavings(deal.dealType, weights);

  const deliveryFee = deal.value?.deliveryFee ?? 0;
  const minOrder = deal.minOrder ?? 0;
  const distancePenalty =
    deal.distanceMi === undefined
      ? weights.unknownDistancePenalty
      : weights.distancePenaltyPerMi * deal.distanceMi;

  const score =
    weights.savings * savings -
    weights.deliveryFeePenalty * deliveryFee -
    weights.minOrderPenalty * minOrder -
    distancePenalty;

  return { savings: round2(savings), savingsEstimated, score: round3(score) };
}

/** Highest score first; ties break on the shorter distance, then the name, so the order is stable. */
export function rankDeals<T extends Deal>(deals: T[], weights: ScoreWeights): Array<T & ScoredDeal> {
  return deals
    .map((d) => ({ ...d, ...scoreDeal(d, weights) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity) ||
        a.restaurantName.localeCompare(b.restaurantName),
    );
}

const defaultSavings = (type: DealType, w: ScoreWeights): number => w.defaultSavingsByType[type] ?? w.defaultSavingsByType.other;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

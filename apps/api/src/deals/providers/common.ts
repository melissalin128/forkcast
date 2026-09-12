/**
 * Platform-independent deal parsing: turn a promo string as shown on a
 * delivery platform ("$5 off $20+", "20% off, up to $10", "Free delivery on
 * orders $15+") into a DealType plus whatever numbers are actually in it.
 *
 * Rules:
 *   - never guess. A number we cannot read stays undefined, not 0.
 *   - classification is by the strongest signal present, most specific first.
 *   - the headline is stored verbatim; these are only the derived fields.
 */
import type { DealType, DealValue } from '../../models/types';

export interface ParsedDeal {
  dealType: DealType;
  value?: DealValue;
  minOrder?: number;
  promoCode?: string;
}

/** "$12.50" / "12.50" / "$1,250" -> 12.5 / 1250. Returns undefined for anything else. */
export function parseMoney(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = /-?\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/.exec(String(text));
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Percent in "20% off" / "Save 15 %" -> 20 / 15. */
export function parsePercent(text: string): number | undefined {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
}

/**
 * Minimum order: "$5 off $20+", "on orders over $15", "min. $12", "spend $30".
 * Deliberately narrow: a bare second dollar amount is not assumed to be a minimum.
 */
export function parseMinOrder(text: string): number | undefined {
  const patterns = [
    /(?:orders?|purchases?|subtotals?)\s+(?:of\s+)?(?:over|above|at\s+least|\$?\s*)?\$\s*(\d+(?:\.\d+)?)/i,
    /(?:min(?:imum)?\.?|spend|when\s+you\s+spend)\s*(?:order\s*)?(?:of\s*)?\$\s*(\d+(?:\.\d+)?)/i,
    /\$\s*(\d+(?:\.\d+)?)\s*\+/,
    /over\s+\$\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** An explicit promo code: "use code SAVE20", "code: WELCOME". Not every uppercase word. */
export function parsePromoCode(text: string): string | undefined {
  const m = /\bcode:?\s*["']?([A-Z0-9][A-Z0-9_-]{2,19})\b/i.exec(text);
  return m ? m[1].toUpperCase() : undefined;
}

// `\b` before `$` never matches (both sides are non-word), so these anchor on ^ or a non-word char instead.
const FREE_DELIVERY = /(?:^|\W)(?:free|no|\$\s*0(?:\.00)?)\s+(?:delivery|deliveries|shipping)\b|\bdelivery\s+(?:fee\s+)?free\b/i;
const REDUCED_DELIVERY = /\$\s*\d+(?:\.\d+)?\s*delivery\s*(?:fee)?\b|\b(?:reduced|lower(?:ed)?|discounted)\s+delivery\b/i;
const BOGO = /\bbogo\b|\bbuy\s*(?:one|1|\d+)\s*,?\s*get\s*(?:one|1|\d+)\b|\b2\s*for\s*1\b/i;
// "$5 off …" and "Save $8 …" / "Get $8 off" are the same deal stated two ways.
const DOLLAR_OFF = /\$\s*(\d+(?:\.\d+)?)\s*off\b|\b(?:save|get|take)\s+\$\s*(\d+(?:\.\d+)?)/i;
const PERCENT_OFF = /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:off|discount)?/i;
const ITEM_DISCOUNT = /\b(?:free|\$\s*\d+(?:\.\d+)?)\s+(?!delivery|shipping)[a-z]/i;

/**
 * Classify one promo headline. `hints` lets a provider pass numbers the actor
 * gave structurally (a strikethrough price, a delivery fee) so we do not have
 * to re-read them out of the text.
 */
export function classifyDeal(headline: string, hints: DealValue = {}): ParsedDeal {
  const text = headline.trim();
  const value: DealValue = { ...hints };
  const minOrder = parseMinOrder(text);
  const promoCode = parsePromoCode(text);
  const withExtras = (dealType: DealType): ParsedDeal => {
    const v = Object.fromEntries(Object.entries(value).filter(([, n]) => n !== undefined && Number.isFinite(n)));
    return {
      dealType,
      ...(Object.keys(v).length > 0 ? { value: v as DealValue } : {}),
      ...(minOrder !== undefined ? { minOrder } : {}),
      ...(promoCode ? { promoCode } : {}),
    };
  };

  if (value.originalPrice !== undefined && value.salePrice !== undefined && value.salePrice < value.originalPrice) {
    if (value.dollars === undefined) value.dollars = round2(value.originalPrice - value.salePrice);
    if (value.percent === undefined && value.originalPrice > 0) {
      value.percent = Math.round(((value.originalPrice - value.salePrice) / value.originalPrice) * 100);
    }
    return withExtras('item_discount');
  }

  if (FREE_DELIVERY.test(text)) {
    value.deliveryFee = 0;
    return withExtras('free_delivery');
  }
  if (REDUCED_DELIVERY.test(text)) {
    value.deliveryFee ??= parseMoney(text);
    return withExtras('reduced_delivery_fee');
  }
  if (BOGO.test(text)) return withExtras('bogo');

  const dollars = DOLLAR_OFF.exec(text);
  if (dollars) {
    value.dollars ??= Number(dollars[1] ?? dollars[2]);
    return withExtras('dollar_off');
  }
  const percent = PERCENT_OFF.exec(text);
  if (percent && /off|save|discount/i.test(text)) {
    value.percent ??= parsePercent(text);
    return withExtras('percent_off');
  }
  if (ITEM_DISCOUNT.test(text)) return withExtras('item_discount');
  if (promoCode) return withExtras('promo_code');
  return withExtras('other');
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

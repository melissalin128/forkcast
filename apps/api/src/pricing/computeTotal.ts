import type { Offer, OfferPromo, Promo, SubscriptionSlug } from '../models/types';

export interface TotalBreakdown {
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  smallOrderFee: number;
  tax: number;
  tip: number;
  promoDiscount: number;
  total: number;
  /** Code of the promo that produced `promoDiscount`, if any. */
  promoCode?: string;
  /** Subscription that changed the fees, if any. */
  subscriptionApplied?: SubscriptionSlug;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Accepts "dashpass", "DashPass", "dash-pass", "uber one", "grubhub+" ... */
export function normalizeSubscription(raw: string): SubscriptionSlug | null {
  const s = raw.toLowerCase().replace(/[^a-z+]/g, '');
  if (s === 'dashpass') return 'dashpass';
  if (s === 'uberone') return 'uberone';
  if (s === 'grubhubplus' || s === 'grubhub+') return 'grubhubplus';
  return null;
}

type OfferFees = Pick<Offer, 'platformSlug' | 'subtotal' | 'serviceFee' | 'deliveryFee' | 'smallOrderFee' | 'tax'> & {
  promo?: OfferPromo;
};

/**
 * The single place fee logic lives (spec section 5). The web app never
 * re-implements this.
 *
 * Subscription rules:
 *  - DashPass  (DoorDash):  subtotal >= $12 -> delivery fee waived, service fee becomes 5% of subtotal
 *  - Uber One  (Uber Eats): subtotal >= $15 -> delivery fee waived, service fee becomes 5% of subtotal
 *  - Grubhub+  (Grubhub):   subtotal >= $12 -> delivery fee waived
 *
 * Promo rules (percent | flat | freeDelivery, each with minSubtotal) apply only
 * when `now` is within [startsAt, endsAt] and the promo belongs to the offer's
 * platform. When several qualify, the one with the largest discount wins.
 */
export function computeTotal(
  offer: OfferFees,
  userSubscriptions: string[] = [],
  activePromos: Array<Promo | OfferPromo> = [],
  tipPct = 0.15,
  now: Date = new Date(),
): TotalBreakdown {
  const subtotal = round2(offer.subtotal);
  let serviceFee = round2(offer.serviceFee);
  let deliveryFee = round2(offer.deliveryFee);
  const smallOrderFee = round2(offer.smallOrderFee ?? 0);
  const tax = round2(offer.tax);
  let subscriptionApplied: SubscriptionSlug | undefined;

  const subs = new Set(
    userSubscriptions.map(normalizeSubscription).filter((s): s is SubscriptionSlug => s !== null),
  );

  if (offer.platformSlug === 'doordash' && subs.has('dashpass') && subtotal >= 12) {
    deliveryFee = 0;
    serviceFee = round2(subtotal * 0.05);
    subscriptionApplied = 'dashpass';
  } else if (offer.platformSlug === 'ubereats' && subs.has('uberone') && subtotal >= 15) {
    deliveryFee = 0;
    serviceFee = round2(subtotal * 0.05);
    subscriptionApplied = 'uberone';
  } else if (offer.platformSlug === 'grubhub' && subs.has('grubhubplus') && subtotal >= 12) {
    deliveryFee = 0;
    subscriptionApplied = 'grubhubplus';
  }

  const tip = round2(subtotal * tipPct);

  // Promos: platform-scoped candidates from the promo table plus the one the
  // platform itself showed on the offer, if any.
  const candidates: Array<Promo | OfferPromo> = [...activePromos];
  if (offer.promo) candidates.push(offer.promo);

  let promoDiscount = 0;
  let promoCode: string | undefined;
  const t = now.getTime();
  for (const p of candidates) {
    if ('platformSlug' in p && p.platformSlug && p.platformSlug !== offer.platformSlug) continue;
    const starts = new Date(p.startsAt).getTime();
    const ends = new Date(p.endsAt).getTime();
    if (Number.isNaN(starts) || Number.isNaN(ends) || t < starts || t > ends) continue;
    if (subtotal < (p.rule.minSubtotal ?? 0)) continue;

    let discount = 0;
    switch (p.rule.type) {
      case 'percent':
        discount = subtotal * (p.rule.value / 100);
        break;
      case 'flat':
        discount = Math.min(p.rule.value, subtotal);
        break;
      case 'freeDelivery':
        discount = deliveryFee;
        break;
    }
    discount = round2(discount);
    if (discount > promoDiscount) {
      promoDiscount = discount;
      promoCode = p.code;
    }
  }

  const total = round2(
    Math.max(0, subtotal + serviceFee + deliveryFee + smallOrderFee + tax + tip - promoDiscount),
  );

  return {
    subtotal,
    serviceFee,
    deliveryFee,
    smallOrderFee,
    tax,
    tip,
    promoDiscount,
    total,
    ...(promoCode ? { promoCode } : {}),
    ...(subscriptionApplied ? { subscriptionApplied } : {}),
  };
}

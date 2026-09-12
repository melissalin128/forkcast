import { PLATFORM_BY_SLUG, PLATFORMS } from '../data/mock';
import { usePrefs } from '../hooks/usePrefs';
import { etaRange, fees, money } from '../lib/analysis';
import type { Restaurant } from '../types';

/**
 * The three-platform ledger for the representative order: App / Food / Fees /
 * Total per platform. Cheapest row is mint. Totals carry `data-price` so the
 * Prices tab can count them up.
 */
export function PlatformLedger({ restaurant: r }: { restaurant: Restaurant }) {
  const { prefs } = usePrefs();
  const offers = [...r.offers].sort((a, b) => a.total - b.total);
  const missing = PLATFORMS.filter((p) => !r.offers.some((o) => o.platformSlug === p.slug));
  const passes = prefs.subscriptions.map((s) => PLATFORM_BY_SLUG[s].subscriptionName);
  const passText =
    passes.length === 0
      ? 'No passes applied.'
      : passes.length === 1
        ? `Your ${passes[0]} is applied.`
        : `Your ${passes.slice(0, -1).join(', ')} and ${passes[passes.length - 1]} are applied.`;

  return (
    <section className="card ledger" aria-label="Price on each app">
      <div className="card__head">
        <h3 className="card__title">{r.orderLabel}</h3>
        <span className="card__meta">
          to <span className="num">{prefs.zip}</span> · tip {r.tipPct}% · Prices from today
        </span>
      </div>

      <div className="ledger__table">
        <div className="ledger__row ledger__row--head" aria-hidden="true">
          <span>App</span>
          <span>Food</span>
          <span>Fees</span>
          <span>Total</span>
        </div>
        {offers.map((o, i) => {
          const best = i === 0 && offers.length > 1;
          const p = PLATFORM_BY_SLUG[o.platformSlug];
          return (
            <div key={o.platformSlug} className={`ledger__row${best ? ' ledger__row--best' : ''}`}>
              <span className="ledger__plat">
                <span className="ledger__name">
                  {p.name} <span className="ledger__eta">{etaRange(o)}</span>
                </span>
                {o.promoDiscount > 0 && <span className="ledger__note ledger__note--promo">includes {money(o.promoDiscount)} off</span>}
                {o.subscriptionApplied && <span className="ledger__note">with {p.subscriptionName}</span>}
              </span>
              <span className="num">{money(o.subtotal)}</span>
              <span className="num">{money(fees(o))}</span>
              <span className="num ledger__total" data-price={o.total}>
                {money(o.total)}
              </span>
            </div>
          );
        })}
        {missing.map((p) => (
          <div key={p.slug} className="ledger__row ledger__row--missing">
            <span className="ledger__plat">
              <span className="ledger__name">{p.name}</span>
            </span>
            <span className="ledger__missingtext">not listed near {prefs.zip}</span>
          </div>
        ))}
      </div>

      <p className="card__foot">
        Fees include delivery, service, tax and a {r.tipPct}% tip. {passText}
      </p>
    </section>
  );
}

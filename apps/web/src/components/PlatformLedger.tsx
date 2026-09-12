import { useEffect, useRef } from 'react';
import { PLATFORMS, PLATFORM_BY_SLUG, USER_SUBSCRIPTIONS, ZIP } from '../data/mock';
import { fees, minutesAgo, money, platformName } from '../lib/analysis';
import { countUpPrices, drawEdge, slideIn } from '../lib/motion';
import type { Restaurant } from '../types';
import { PlatformDot } from './PlatformDot';

interface Props {
  restaurant: Restaurant;
  /** Bumps every time the ledger becomes visible so the reveal replays. */
  revealKey: number;
}

export function PlatformLedger({ restaurant: r, revealKey }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const offers = [...r.offers].sort((a, b) => a.total - b.total);
  const missing = PLATFORMS.filter((p) => !r.offers.some((o) => o.platformSlug === p.slug));
  const passes = USER_SUBSCRIPTIONS.map((s) => PLATFORM_BY_SLUG[s].subscriptionName);
  const passText =
    passes.length === 0
      ? ''
      : passes.length === 1
        ? ` Your ${passes[0]} is already applied.`
        : ` Your ${passes.slice(0, -1).join(', ')} and ${passes[passes.length - 1]} are already applied.`;

  useEffect(() => {
    if (revealKey === 0) return;
    const root = ref.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row]'));
    const stopRows = slideIn(rows, 50);
    const stopPrices = countUpPrices(root);
    const stopEdge = drawEdge(root.querySelector('.ledger__edge'), 50 * rows.length + 500);
    return () => {
      stopRows();
      stopPrices();
      stopEdge();
    };
  }, [revealKey]);

  return (
    <div className="card ledger" ref={ref}>
      <div className="ledger__head">
        <span className="label">
          {r.orderLabel} to {ZIP}
        </span>
        <span className="ledger__meta">
          tip {r.tipPct}% · refreshed {minutesAgo(offers[0]?.fetchedAt ?? new Date().toISOString())}
        </span>
      </div>
      <div className="ledger__scroll">
        <div className="ledger__cols" aria-hidden="true">
          <span>Platform</span>
          <span>Food</span>
          <span>Fees</span>
          <span>Deal</span>
          <span>Total</span>
          <span>ETA</span>
        </div>
        {offers.map((o, i) => {
          const best = i === 0;
          const platform = PLATFORM_BY_SLUG[o.platformSlug];
          return (
            <div
              key={o.platformSlug}
              className={`ledger__row${best ? ' ledger__row--best' : ''} reveal`}
              data-row
            >
              {best && <span className="ledger__edge" aria-hidden="true" />}
              <span className="ledger__platform">
                <PlatformDot slug={o.platformSlug} size="md" />
                {platform.name}
                {o.subscriptionApplied && <span className="ledger__sub">{platform.subscriptionName}</span>}
              </span>
              <span>{money(o.subtotal)}</span>
              <span>{money(fees(o))}</span>
              <span className={o.promoDiscount > 0 ? 'ledger__promo' : ''}>
                {o.promoDiscount > 0 ? (
                  <>
                    {money(-o.promoDiscount)}
                    {o.promo && <span className="ledger__code">{o.promo.code}</span>}
                  </>
                ) : (
                  '—'
                )}
              </span>
              <span className="ledger__total" data-price={o.total}>
                {money(o.total)}
              </span>
              <span className="ledger__eta">{o.etaMin} min</span>
            </div>
          );
        })}
      </div>
      {missing.map((p) => (
        <div key={p.slug} className="ledger__missing">
          <PlatformDot slug={p.slug} size="md" />
          {platformName(p.slug)} does not list {r.name} near {ZIP}.
        </div>
      ))}
      <div className="ledger__foot">
        Totals include the food, fees, tax and a {r.tipPct}% tip.{passText}
      </div>
    </div>
  );
}

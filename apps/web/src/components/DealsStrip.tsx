import { Link } from 'react-router-dom';
import type { PromosResponse } from '../api/client';
import { PLATFORM_BY_SLUG } from '../data/mock';
import { activeDeals, money, platformName } from '../lib/analysis';
import type { Restaurant } from '../types';

interface Props {
  promos: PromosResponse['promos'];
  restaurants: Restaurant[];
}

function hoursLeft(p: PromosResponse['promos'][number]): string {
  if (typeof p.hoursLeft === 'number') {
    if (p.hoursLeft < 24) return `${p.hoursLeft}h left`;
    return `${Math.round(p.hoursLeft / 24)}d left`;
  }
  const ms = new Date(p.endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'ends soon';
  const hours = Math.round(ms / 36e5);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

/** Horizontal platform deals plus restaurants that already have a promo on the total. */
export function DealsStrip({ promos, restaurants }: Props) {
  const live = promos.filter((p) => new Date(p.endsAt).getTime() > Date.now());
  const hits = restaurants
    .map((r) => ({ r, deals: activeDeals(r) }))
    .filter((x) => x.deals.length > 0)
    .slice(0, 8);

  if (live.length === 0 && hits.length === 0) return null;

  return (
    <section className="deals" aria-label="Best deals right now">
      <div className="deals__head">
        <h3 className="deals__title">Best deals right now</h3>
        <span className="deals__sub">Simulated demo promos · already in the totals</span>
      </div>
      <div className="deals__row">
        {live.map((p) => {
          const plat = PLATFORM_BY_SLUG[p.platformSlug];
          return (
            <Link key={`${p.platformSlug}-${p.code}`} to="/savings" className="dealcard">
              <span className="dealcard__plat" style={{ color: plat.brandColor }}>
                {plat.name}
              </span>
              <span className="dealcard__code">{p.code}</span>
              <span className="dealcard__desc">{p.description ?? p.label}</span>
              <span className="dealcard__time">{hoursLeft(p)}</span>
            </Link>
          );
        })}
        {hits.map(({ r, deals }) => {
          const best = deals.sort((a, b) => b.promoDiscount - a.promoDiscount)[0];
          return (
            <Link key={r.id} to={`/store/${r.id}?tab=prices`} className="dealcard dealcard--place">
              <span className="dealcard__plat" style={{ color: PLATFORM_BY_SLUG[best.platformSlug].brandColor }}>
                {platformName(best.platformSlug)}
              </span>
              <span className="dealcard__code">{r.name}</span>
              <span className="dealcard__desc">
                {money(best.promoDiscount)} off this order · {money(best.total)} total
              </span>
              <span className="dealcard__time">{best.promo?.code ?? 'promo applied'}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

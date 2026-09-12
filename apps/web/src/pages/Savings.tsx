import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { Photo } from '../components/Photo';
import { TopBar } from '../components/TopBar';
import { PLATFORM_BY_SLUG, PLATFORMS } from '../data/mock';
import { usePromos, useRestaurants } from '../hooks/useData';
import { activeDeals, bestOffer, money, platformName, saving, worstOffer } from '../lib/analysis';
import { restaurantPhoto } from '../lib/photos';

function hoursLeft(endsAt: string, fallback?: number): string {
  if (typeof fallback === 'number') {
    return fallback < 24 ? `${fallback}h left` : `${Math.round(fallback / 24)}d left`;
  }
  const hours = Math.round((new Date(endsAt).getTime() - Date.now()) / 36e5);
  if (!Number.isFinite(hours) || hours <= 0) return 'ends soon';
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

/** Deals per platform plus where picking the cheapest app matters most. */
export function Savings() {
  const { restaurants, loading } = useRestaurants();
  const { promos } = usePromos();

  const rows = useMemo(
    () =>
      restaurants
        .filter((r) => r.offers.length > 1)
        .map((r) => ({ r, save: saving(r), best: bestOffer(r)!, worst: worstOffer(r)! }))
        .filter((x) => x.save >= 0.05)
        .sort((a, b) => b.save - a.save),
    [restaurants],
  );

  const livePromos = promos.filter((p) => new Date(p.endsAt).getTime() > Date.now());
  const promoHits = restaurants
    .map((r) => ({ r, deals: activeDeals(r) }))
    .filter((x) => x.deals.length > 0)
    .sort((a, b) => Math.max(...b.deals.map((d) => d.promoDiscount)) - Math.max(...a.deals.map((d) => d.promoDiscount)));

  return (
    <div className="page">
      <TopBar title="Savings" />

      <div className="section-head">
        <div>
          <h2 className="section-head__title">Deals by app</h2>
          <span className="section-head__sub">
            Simulated demo promos. They are already folded into the totals on Home.
          </span>
        </div>
      </div>

      <div className="platdeals">
        {PLATFORMS.map((p) => {
          const list = livePromos.filter((promo) => promo.platformSlug === p.slug);
          return (
            <section key={p.slug} className="card card--gap platdeal">
              <h3 className="card__title" style={{ color: p.brandColor }}>
                {p.name}
              </h3>
              {list.length === 0 ? (
                <p className="card__foot">No live demo promo on {p.name} right now.</p>
              ) : (
                <ul className="platdeal__list">
                  {list.map((promo) => (
                    <li key={promo.code}>
                      <strong>{promo.code}</strong> · {promo.description ?? promo.label} ·{' '}
                      {hoursLeft(promo.endsAt, promo.hoursLeft)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {promoHits.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <h2 className="section-head__title">Promos already in a total</h2>
              <span className="section-head__sub">Same representative order. Demo-labeled.</span>
            </div>
          </div>
          <ul className="savelist">
            {promoHits.map(({ r, deals }) => {
              const top = [...deals].sort((a, b) => b.promoDiscount - a.promoDiscount)[0];
              return (
                <li key={r.id}>
                  <Link to={`/store/${r.id}?tab=prices`} className="save">
                    <Photo className="save__thumb" src={restaurantPhoto(r)} fallback={r.image} iconSize={18} />
                    <span className="save__text">
                      <span className="save__name">{r.name}</span>
                      <span className="save__detail">
                        {platformName(top.platformSlug)} · {top.promo?.code ?? PLATFORM_BY_SLUG[top.platformSlug].name} ·{' '}
                        <strong className="save__amt">{money(top.promoDiscount)} off</strong>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="section-head">
        <div>
          <h2 className="section-head__title">Where you save the most</h2>
          <span className="section-head__sub">
            {loading ? 'Checking three apps…' : 'Cheapest app vs priciest app, same order · Prices from today'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="notice">Checking three apps…</div>
      ) : rows.length === 0 ? (
        <div className="notice">Every app charges about the same near you right now.</div>
      ) : (
        <ul className="savelist">
          {rows.map(({ r, save, best, worst }) => (
            <li key={r.id}>
              <Link to={`/store/${r.id}?tab=prices`} className="save">
                <Photo className="save__thumb" src={restaurantPhoto(r)} fallback={r.image} iconSize={18} />
                <span className="save__text">
                  <span className="save__name">{r.name}</span>
                  <span className="save__detail">
                    {platformName(best.platformSlug)} <span className="num">{money(best.total)}</span> ·{' '}
                    <strong className="save__amt">save {money(save)}</strong> vs {platformName(worst.platformSlug)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BottomTabs />
    </div>
  );
}

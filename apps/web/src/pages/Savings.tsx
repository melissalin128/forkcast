import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { Photo } from '../components/Photo';
import { TopBar } from '../components/TopBar';
import { useRestaurants } from '../hooks/useData';
import { bestOffer, money, platformName, saving, worstOffer } from '../lib/analysis';
import { restaurantPhoto } from '../lib/photos';

/** Where picking the cheapest app matters most: the gap between cheapest and priciest, per restaurant. */
export function Savings() {
  const { restaurants, loading } = useRestaurants();

  const rows = useMemo(
    () =>
      restaurants
        .filter((r) => r.offers.length > 1)
        .map((r) => ({ r, save: saving(r), best: bestOffer(r)!, worst: worstOffer(r)! }))
        .filter((x) => x.save >= 0.05)
        .sort((a, b) => b.save - a.save),
    [restaurants],
  );

  return (
    <div className="page">
      <TopBar title="Savings" />

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

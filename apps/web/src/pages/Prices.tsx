import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { PlatformDot } from '../components/PlatformDot';
import { TopBar } from '../components/TopBar';
import { useRestaurants } from '../hooks/useData';
import { bestOffer, money, platformName, saving, worstOffer } from '../lib/analysis';

/** Biggest savings today: the gap between the cheapest and priciest app, per restaurant. */
export function Prices() {
  const { restaurants, loading } = useRestaurants();

  const rows = useMemo(
    () =>
      restaurants
        .filter((r) => r.offers.length > 1)
        .map((r) => ({ r, save: saving(r), best: bestOffer(r)!, worst: worstOffer(r)! }))
        .sort((a, b) => b.save - a.save),
    [restaurants],
  );
  const total = rows.reduce((n, x) => n + x.save, 0);

  return (
    <div className="page">
      <TopBar title="Prices" />

      <div className="stat">
        <span className="stat__label">Biggest savings today</span>
        <span className="stat__big mono win">{money(total)}</span>
        <span className="stat__sub">
          if you pick the cheapest app for every one of these {rows.length} places instead of the priciest.
        </span>
      </div>

      {loading ? (
        <div className="notice">Checking three apps…</div>
      ) : (
        <ul className="savelist">
          {rows.map(({ r, save, best, worst }) => (
            <li key={r.id}>
              <Link to={`/store/${r.id}?tab=prices`} className="save">
                <span className="save__main">
                  <span className="save__name">{r.name}</span>
                  <span className="save__detail">
                    <PlatformDot slug={best.platformSlug} /> {platformName(best.platformSlug)}{' '}
                    <span className="mono">{money(best.total)}</span>
                    <span className="save__vs">
                      {' '}
                      vs <PlatformDot slug={worst.platformSlug} /> {platformName(worst.platformSlug)}{' '}
                      <span className="mono">{money(worst.total)}</span>
                    </span>
                  </span>
                </span>
                <span className="save__amt mono">
                  {save >= 0.05 ? `save ${money(save)}` : 'same'}
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

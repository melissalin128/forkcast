import { Link } from 'react-router-dom';
import { bestOffer, money, platformName, ratingCount, saving, savingsTail } from '../lib/analysis';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { categoryIcon, StarIcon } from './Icons';

/** Full-width feed card: art, name, meta, compare strip, one savings line. */
export function RestaurantRow({ restaurant: r }: { restaurant: Restaurant }) {
  const best = bestOffer(r);
  if (!best) return null;
  const Icon = categoryIcon(r.category);
  const save = saving(r);

  return (
    <Link to={`/store/${r.id}`} className="row" data-card>
      <div className="row__art" style={{ background: r.image }}>
        <Icon size={44} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
        {save >= 0.5 && <span className="row__badge">Save {money(save)}</span>}
      </div>
      <div className="row__body">
        <div className="row__name">{r.name}</div>
        <div className="row__meta">
          <StarIcon stroke="var(--fg)" /> <span className="mono">{r.rating.toFixed(1)}</span> (
          {ratingCount(r.ratingCount)}) · {r.cuisine[0]} · <span className="mono">{r.distanceMi} mi</span>
        </div>
        <CompareStrip restaurant={r} />
        <div className="row__line">
          <strong>Cheapest on {platformName(best.platformSlug)}</strong> · {savingsTail(r)}
        </div>
      </div>
    </Link>
  );
}

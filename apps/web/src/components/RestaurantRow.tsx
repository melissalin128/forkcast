import { Link } from 'react-router-dom';
import { usePrefs } from '../hooks/usePrefs';
import {
  activeDeals,
  bestOffer,
  cheapestFeeOffer,
  fastestOffer,
  money,
  platformName,
  ratingCount,
} from '../lib/analysis';
import { hawtPixScore, type Sort } from '../lib/filter';
import { restaurantPhoto } from '../lib/photos';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { HeartIcon, StarIcon } from './Icons';
import { Photo } from './Photo';

interface Props {
  restaurant: Restaurant;
  /** Under "Fastest" the highlight and the last line talk about time instead of price. */
  sort?: Sort;
}

/** Feed card: 16:9 photo, name + meta, and the three-platform price strip. */
export function RestaurantRow({ restaurant: r, sort = 'cheapest' }: Props) {
  const { prefs, toggleSaved } = usePrefs();
  const best = bestOffer(r);
  const fastest = fastestOffer(r);
  const lowFee = cheapestFeeOffer(r);
  if (!best || !fastest || !lowFee) return null;
  const byFee = sort === 'cheapestFee';
  const deals = activeDeals(r);
  const saved = prefs.savedRestaurantIds.includes(r.id);
  const forYou = hawtPixScore(r, prefs) > 0;

  return (
    <Link to={`/store/${r.id}`} className="row" data-card>
      <div className="row__photo-wrap">
        <Photo className="row__photo" src={restaurantPhoto(r)} fallback={r.image} />
        {deals.length > 0 && (
          <span className="badge badge--deal">
            {money(Math.max(...deals.map((d) => d.promoDiscount)))} off {platformName(deals[0].platformSlug)}
          </span>
        )}
        {forYou && <span className="badge badge--you">For you</span>}
        <button
          type="button"
          className={`savebtn${saved ? ' savebtn--on' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${r.name}` : `Save ${r.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSaved(r.id);
          }}
        >
          <HeartIcon size={16} stroke={saved ? '#fff' : 'currentColor'} filled={saved} />
        </button>
      </div>

      <div className="row__body">
        <div className="row__name" title={r.name}>
          {r.name}
        </div>
        <div className="row__meta">
          <StarIcon stroke="var(--fg)" />
          <span>
            <span className="num">{r.rating.toFixed(1)}</span> ({ratingCount(r.ratingCount)}) · {r.cuisine[0]} ·{' '}
            <span className="num">{r.distanceMi} mi</span>
          </span>
        </div>

        <CompareStrip restaurant={r} />

        {/* Delivery fee is the one number the strip does not show, so "Low fee"
            still gets a line. Other sorts need no caption under the prices. */}
        {byFee && (
          <div className="row__line">
            <strong>Lowest fee on {platformName(lowFee.platformSlug)}</strong> · {money(lowFee.deliveryFee)} delivery
          </div>
        )}
      </div>
    </Link>
  );
}

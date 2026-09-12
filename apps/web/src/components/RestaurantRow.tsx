import { Link } from 'react-router-dom';
import {
  bestOffer,
  etaRange,
  fastestOffer,
  orderSummary,
  platformName,
  ratingCount,
  savingsTail,
} from '../lib/analysis';
import type { Sort } from '../lib/filter';
import { restaurantPhoto } from '../lib/photos';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { StarIcon } from './Icons';
import { Photo } from './Photo';

interface Props {
  restaurant: Restaurant;
  /** Under "Fastest" the highlight and the last line talk about time instead of price. */
  sort?: Sort;
}

/** Feed card: 16:9 photo, name + meta, the compare strip, what the price is for, one verdict line. */
export function RestaurantRow({ restaurant: r, sort = 'cheapest' }: Props) {
  const best = bestOffer(r);
  const fastest = fastestOffer(r);
  if (!best || !fastest) return null;
  const byTime = sort === 'fastest';

  return (
    <Link to={`/store/${r.id}`} className="row" data-card>
      <Photo className="row__photo" src={restaurantPhoto(r)} fallback={r.image} />

      <div className="row__body">
        <div className="row__name">{r.name}</div>
        <div className="row__meta">
          <StarIcon stroke="var(--fg)" />
          <span>
            <span className="num">{r.rating.toFixed(1)}</span> ({ratingCount(r.ratingCount)}) · {r.cuisine[0]} ·{' '}
            <span className="num">{r.distanceMi} mi</span>
          </span>
        </div>

        <CompareStrip restaurant={r} highlight={byTime ? 'fastest' : 'cheapest'} />

        <div className="row__for">For {orderSummary(r)}, delivered</div>

        <div className="row__line">
          {byTime ? (
            <>
              <strong>Fastest on {platformName(fastest.platformSlug)}</strong> · {etaRange(fastest)}
            </>
          ) : (
            <>
              <strong>Cheapest on {platformName(best.platformSlug)}</strong> · {savingsTail(r)}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

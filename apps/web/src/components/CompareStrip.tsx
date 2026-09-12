import { PLATFORMS } from '../data/mock';
import { bestOffer, etaRange, fastestOffer, money, offerFor } from '../lib/analysis';
import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
  /** Adds `data-price` so the Store page can count the totals up. */
  animate?: boolean;
  /** Which column gets the mint highlight. */
  highlight?: 'cheapest' | 'fastest';
}

/**
 * The product: three fixed columns (DoorDash, Uber Eats, Grubhub) with the
 * delivered total for the same order. The winning column is mint; "—" when
 * the platform does not list the place.
 */
export function CompareStrip({ restaurant: r, animate = false, highlight = 'cheapest' }: Props) {
  const top = highlight === 'fastest' ? fastestOffer(r) : bestOffer(r);
  return (
    <div className="strip" role="list" aria-label="Delivered total per app">
      {PLATFORMS.map((p) => {
        const o = offerFor(r, p.slug);
        const isTop = !!o && !!top && o.platformSlug === top.platformSlug && r.offers.length > 1;
        return (
          <div
            key={p.slug}
            role="listitem"
            className={`strip__col${isTop ? ' strip__col--best' : ''}${o ? '' : ' strip__col--none'}`}
          >
            <span className="strip__plat">{p.name}</span>
            {o ? (
              <>
                <span className="strip__price num" data-price={animate ? o.total : undefined}>
                  {money(o.total)}
                </span>
                <span className="strip__eta">{etaRange(o)}</span>
              </>
            ) : (
              <>
                <span className="strip__price num">—</span>
                <span className="strip__eta">not listed</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

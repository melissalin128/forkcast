import { PLATFORMS } from '../data/mock';
import { bestOffer, money, offerFor } from '../lib/analysis';
import type { Restaurant } from '../types';
import { PlatformDot } from './PlatformDot';

interface Props {
  restaurant: Restaurant;
  /** Adds `data-price` so the Store page can count the totals up. */
  animate?: boolean;
}

/**
 * The product: three fixed columns (DoorDash, Uber Eats, Grubhub) with the
 * delivered total for the same order. Cheapest column is mint; "—" when the
 * platform does not list the place.
 */
export function CompareStrip({ restaurant: r, animate = false }: Props) {
  const best = bestOffer(r);
  return (
    <div className="strip" role="list" aria-label="Delivered total per app">
      {PLATFORMS.map((p) => {
        const o = offerFor(r, p.slug);
        const isBest = !!o && !!best && o.platformSlug === best.platformSlug && r.offers.length > 1;
        return (
          <div
            key={p.slug}
            role="listitem"
            className={`strip__col${isBest ? ' strip__col--best' : ''}${o ? '' : ' strip__col--none'}`}
          >
            <span className="strip__plat">
              <PlatformDot slug={p.slug} />
              {p.name}
            </span>
            {o ? (
              <>
                <span className="strip__price mono" data-price={animate ? o.total : undefined}>
                  {money(o.total)}
                </span>
                <span className="strip__eta">{o.etaMin}–{o.etaMax} min</span>
              </>
            ) : (
              <>
                <span className="strip__price mono">—</span>
                <span className="strip__eta">not listed</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

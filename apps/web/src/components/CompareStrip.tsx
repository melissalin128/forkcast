import { PLATFORMS } from '../data/mock';
import { etaRange, money, offerFor } from '../lib/analysis';
import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
  /** Adds `data-price` so the Store page can count the totals up. */
  animate?: boolean;
}

/**
 * The product: three fixed columns (DoorDash, Uber Eats, Grubhub) with the
 * delivered total for the same order. Platform names sit in their brand color
 * and every column is styled alike — the numbers are the comparison, so none of
 * them is singled out. "—" when the platform does not list the place.
 */
export function CompareStrip({ restaurant: r, animate = false }: Props) {
  return (
    <div className="strip" role="list" aria-label="Delivered total per app">
      {PLATFORMS.map((p) => {
        const o = offerFor(r, p.slug);
        return (
          <div key={p.slug} role="listitem" className={`strip__col${o ? '' : ' strip__col--none'}`}>
            <span className="strip__plat" style={o ? { color: p.brandColor } : undefined}>
              {p.name}
            </span>
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

import { useEffect, useRef, useState } from 'react';
import type { Sort } from '../lib/filter';
import type { Restaurant } from '../types';
import { RestaurantRow } from './RestaurantRow';

interface Props {
  restaurants: Restaurant[];
  loading: boolean;
  sort?: Sort;
  emptyText: string;
  action?: { label: string; onClick: () => void };
}

/** Rows mounted per step. All 655 at once blocks the main thread for ~300 ms on a laptop. */
const PAGE = 24;

/**
 * Vertical list of RestaurantRows with loading skeletons and an empty state.
 * Rows mount PAGE at a time as the end of the list nears the viewport; give the
 * Feed a `key` per query so a new filter or sort starts again from the top.
 */
export function Feed({ restaurants, loading, sort, emptyText, action }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const more = restaurants.length > limit;

  // Re-observe after every step: a sentinel that is still in range fires again at once.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((n) => n + PAGE), { rootMargin: '1500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, more]);

  if (loading) {
    return (
      <div className="feed" aria-busy="true" aria-label="Loading prices">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row row--skeleton">
            <div className="sk sk--photo" />
            <div className="row__body">
              <div className="sk sk--title" />
              <div className="sk sk--meta" />
              <div className="strip">
                <div className="sk sk--col" />
                <div className="sk sk--col" />
                <div className="sk sk--col" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div className="feed">
        <div className="empty">
          <p>{emptyText}</p>
          {action && (
            <button type="button" className="btn btn--accent" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="feed">
        {restaurants.slice(0, limit).map((r) => (
          <RestaurantRow key={r.id} restaurant={r} sort={sort} />
        ))}
      </div>
      {more && <div ref={sentinel} aria-hidden="true" />}
    </>
  );
}

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

/** Vertical list of RestaurantRows with loading skeletons and an empty state. */
export function Feed({ restaurants, loading, sort, emptyText, action }: Props) {
  if (loading) {
    return (
      <div className="feed" aria-busy="true" aria-label="Loading prices">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row row--skeleton">
            <div className="row__head">
              <div className="sk row__thumb" />
              <div className="row__text">
                <div className="sk sk--title" />
                <div className="sk sk--meta" />
              </div>
            </div>
            <div className="strip">
              <div className="sk sk--col" />
              <div className="sk sk--col" />
              <div className="sk sk--col" />
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
    <div className="feed">
      {restaurants.map((r) => (
        <RestaurantRow key={r.id} restaurant={r} sort={sort} />
      ))}
    </div>
  );
}

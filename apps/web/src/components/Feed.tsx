import type { Restaurant } from '../types';
import { RestaurantRow } from './RestaurantRow';

interface Props {
  restaurants: Restaurant[];
  loading: boolean;
  emptyText: string;
  onClear?: () => void;
}

/** Vertical list of RestaurantRows with loading skeletons and an empty state. */
export function Feed({ restaurants, loading, emptyText, onClear }: Props) {
  if (loading) {
    return (
      <div className="feed" aria-busy="true" aria-label="Loading prices">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row row--skeleton">
            <div className="row__art" />
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
          {onClear && (
            <button type="button" className="btn btn--ghost" onClick={onClear}>
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="feed">
      {restaurants.map((r) => (
        <RestaurantRow key={r.id} restaurant={r} />
      ))}
    </div>
  );
}

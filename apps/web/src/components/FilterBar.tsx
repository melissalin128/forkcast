import { FILTERS, queryLabel, type Category, type FilterKey } from '../lib/filter';
import { chipPop } from '../lib/motion';

interface Props {
  category: Category;
  query: string;
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
  onClear: () => void;
}

/** Always-visible combined filters: price, time, and diet stack together. */
export function FilterBar({ category, query, active, onToggle, onClear }: Props) {
  const label = queryLabel(category, active, query);
  return (
    <div className="filters">
      <div className="chips" role="group" aria-label="Filters">
        {FILTERS.map((f) => {
          const on = active.includes(f.key);
          return (
            <button
              key={f.key}
              type="button"
              className={`chip${on ? ' chip--active' : ''}`}
              aria-pressed={on}
              onClick={(e) => {
                onToggle(f.key);
                chipPop(e.currentTarget);
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {label && (
        <div className="query" role="status">
          <span className="query__text">{label}</span>
          <button type="button" className="query__clear" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

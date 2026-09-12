import { CATEGORIES } from '../lib/filter';
import { chipPop } from '../lib/motion';
import { CATEGORY_ICONS } from './Icons';

interface Props {
  value: string;
  onChange: (cat: string) => void;
}

/** Eight round-icon categories in a horizontal strip, delivery-app style. */
export function CategoryStrip({ value, onChange }: Props) {
  return (
    <div className="cats" role="group" aria-label="Category">
      {CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const active = value === cat;
        return (
          <button
            key={cat}
            type="button"
            className={`cat${active ? ' cat--active' : ''}`}
            aria-pressed={active}
            onClick={(e) => {
              onChange(cat);
              chipPop(e.currentTarget.firstElementChild ?? e.currentTarget);
            }}
          >
            <span className="cat__circle">
              <Icon size={22} strokeWidth={1.8} />
            </span>
            <span className="cat__label">{cat}</span>
          </button>
        );
      })}
    </div>
  );
}

import { useEffect, useRef } from 'react';

export interface Filters {
  maxPrice: number | null;
  maxEta: number | null;
  dietary: string[];
}

export const EMPTY_FILTERS: Filters = { maxPrice: null, maxEta: null, dietary: [] };

export const DIETARY_OPTIONS = ['Vegan options', 'Vegetarian options', 'Gluten-free options', 'Halal'];

export function activeFilterCount(f: Filters) {
  return (f.maxPrice ? 1 : 0) + (f.maxEta ? 1 : 0) + f.dietary.length;
}

interface Props {
  open: boolean;
  value: Filters;
  resultCount: number;
  onChange: (next: Filters) => void;
  onClose: () => void;
}

/** One simple sheet: price, delivery time, dietary. */
export function FilterSheet({ open, value, resultCount, onChange, onClose }: Props) {
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggleDiet = (tag: string) =>
    onChange({
      ...value,
      dietary: value.dietary.includes(tag)
        ? value.dietary.filter((t) => t !== tag)
        : [...value.dietary, tag],
    });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="card sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <h2 id="filters-title" className="sheet__title">
            Filters
          </h2>
          <button type="button" className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Price (delivered)</legend>
          <div className="options">
            {[
              { v: null, l: 'Any' },
              { v: 15, l: 'Under $15' },
              { v: 20, l: 'Under $20' },
              { v: 30, l: 'Under $30' },
            ].map((o, i) => (
              <label key={o.l} className="opt">
                <input
                  ref={i === 0 ? firstRef : undefined}
                  type="radio"
                  name="price"
                  checked={value.maxPrice === o.v}
                  onChange={() => onChange({ ...value, maxPrice: o.v })}
                />
                {o.l}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Delivery time</legend>
          <div className="options">
            {[
              { v: null, l: 'Any' },
              { v: 30, l: 'Under 30 min' },
              { v: 45, l: 'Under 45 min' },
            ].map((o) => (
              <label key={o.l} className="opt">
                <input
                  type="radio"
                  name="eta"
                  checked={value.maxEta === o.v}
                  onChange={() => onChange({ ...value, maxEta: o.v })}
                />
                {o.l}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Dietary</legend>
          <div className="options">
            {DIETARY_OPTIONS.map((tag) => (
              <label key={tag} className="opt">
                <input
                  type="checkbox"
                  checked={value.dietary.includes(tag)}
                  onChange={() => toggleDiet(tag)}
                />
                {tag}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sheet__actions">
          <button type="button" className="sheet__clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </button>
          <button type="button" className="btn btn--accent" onClick={onClose}>
            Show {resultCount} place{resultCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

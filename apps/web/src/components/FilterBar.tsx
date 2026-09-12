import { useEffect, useState } from 'react';
import { FILTERS, queryLabel, type Category, type FilterKey } from '../lib/filter';
import { chipPop } from '../lib/motion';
import { ClearIcon, SlidersIcon } from './Icons';

interface Props {
  category: Category;
  query: string;
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
  /** Clears only the price/time/diet chips — used by the modal's own "Clear all". */
  onClearFilters: () => void;
  /** Clears search + category + filters together — used by the query-summary line below. */
  onClear: () => void;
  resultCount: number;
  /** Phone toolbar: Filter button only, no chip row or query line. */
  compact?: boolean;
}

const GROUP_LABEL: Record<string, string> = { price: 'Price', time: 'Delivery time', diet: 'Dietary' };
// Derived from FILTERS itself (in first-seen order) so a new group added there
// can never be silently left out of the modal.
const GROUPS = Array.from(new Set(FILTERS.map((f) => f.group)));

/**
 * One "Filters" pill, closed by default. Opening it lifts the same price/time/diet
 * chips into a centered modal (Airbnb's filter-sheet pattern) instead of a row
 * that's always taking up space. Whatever's already on shows as a small removable
 * tag next to the pill, so the active state is never hidden — only the picker is.
 */
export function FilterBar({ category, query, active, onToggle, onClearFilters, onClear, resultCount, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const label = queryLabel(category, active, query);
  const activeChips = FILTERS.filter((f) => active.includes(f.key));

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`filters${compact ? ' filters--compact' : ''}`}>
      <div className="filters__row">
        <div className="chips" role="group" aria-label="Filters">
          <button
            type="button"
            className={`chip chip--filters${active.length ? ' chip--active' : ''}`}
            aria-haspopup="dialog"
            onClick={(e) => {
              setOpen(true);
              chipPop(e.currentTarget);
            }}
          >
            <SlidersIcon size={14} />
            Filters{active.length > 0 ? ` · ${active.length}` : ''}
          </button>

          {!compact &&
            activeChips.map((f) => (
              <button
                key={f.key}
                type="button"
                className="chip chip--active"
                aria-pressed="true"
                onClick={(e) => {
                  onToggle(f.key);
                  chipPop(e.currentTarget);
                }}
              >
                {f.label} ✕
              </button>
            ))}
        </div>
      </div>

      {!compact && label && (
        <div className="query" role="status">
          <span className="query__text">{label}</span>
          <button type="button" className="query__clear" onClick={onClear}>
            Clear
          </button>
        </div>
      )}

      {open && (
        <div className="modal-veil" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal__head">
              <button type="button" className="modal__close" aria-label="Close" onClick={() => setOpen(false)}>
                <ClearIcon size={16} />
              </button>
              <h2 className="modal__title">Filters</h2>
            </div>

            <div className="modal__body">
              {GROUPS.map((group, i) => (
                <div key={group} className={`modal__group${i > 0 ? ' modal__group--rule' : ''}`}>
                  <span className="modal__group-label">{GROUP_LABEL[group]}</span>
                  <div className="chips chips--wrap">
                    {FILTERS.filter((f) => f.group === group).map((f) => {
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
                </div>
              ))}
            </div>

            <div className="modal__foot">
              <button type="button" className="modal__clear" onClick={onClearFilters} disabled={active.length === 0}>
                Clear all
              </button>
              <button type="button" className="btn btn--accent" onClick={() => setOpen(false)}>
                Show {resultCount} place{resultCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

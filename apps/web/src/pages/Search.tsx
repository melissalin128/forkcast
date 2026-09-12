import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { Feed } from '../components/Feed';
import { SortSegment } from '../components/SortSegment';
import { TopBar } from '../components/TopBar';
import { useRestaurants } from '../hooks/useData';
import { FILTERS, matchesFilters, matchesQuery, SORTS, sortBy, type FilterKey, type Sort } from '../lib/filter';
import { chipPop } from '../lib/motion';

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const { restaurants, loading } = useRestaurants();
  const [active, setActive] = useState<FilterKey[]>([]);
  const [sort, setSort] = useState<Sort>('cheapest');

  const setQ = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params);
      if (v) next.set('q', v);
      else next.delete('q');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggle = (key: FilterKey, el: Element) => {
    setActive((a) => (a.includes(key) ? a.filter((k) => k !== key) : [...a, key]));
    chipPop(el);
  };

  const visible = useMemo(
    () => sortBy(restaurants.filter((r) => r.offers.length > 0 && matchesQuery(r, q) && matchesFilters(r, active)), sort),
    [restaurants, q, active, sort],
  );

  return (
    <div className="page">
      <TopBar search={{ value: q, onChange: setQ, autoFocus: !q }} />

      <div className="chips" role="group" aria-label="Filters">
        {FILTERS.map((f) => {
          const on = active.includes(f.key);
          return (
            <button
              key={f.key}
              type="button"
              className={`chip${on ? ' chip--active' : ''}`}
              aria-pressed={on}
              onClick={(e) => toggle(f.key, e.currentTarget)}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="section-head">
        <div>
          <h2 className="section-head__title">{q ? `Results for “${q}”` : 'All places'}</h2>
          <span className="section-head__sub">
            {loading ? 'Checking three apps…' : `${visible.length} place${visible.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <SortSegment options={SORTS} value={sort} onChange={setSort} label="Sort by" />
      </div>

      <Feed
        restaurants={visible}
        loading={loading}
        emptyText={q ? `Nothing matches “${q}” with these filters.` : 'Nothing matches these filters.'}
        onClear={() => {
          setActive([]);
          setQ('');
        }}
      />

      <BottomTabs />
    </div>
  );
}

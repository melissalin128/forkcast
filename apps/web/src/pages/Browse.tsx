import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRestaurants, type Source } from '../api/client';
import { BottomTabs } from '../components/BottomTabs';
import { activeFilterCount, EMPTY_FILTERS, FilterSheet, type Filters } from '../components/FilterSheet';
import { ChevronDown, FilterIcon } from '../components/Icons';
import { ResultCard } from '../components/ResultCard';
import { TopBar } from '../components/TopBar';
import { REFRESHED_AT, ZIP } from '../data/mock';
import { usePhone } from '../hooks/useMedia';
import { bestOffer, fastestOffer, minutesAgo } from '../lib/analysis';
import { chipPop, countUpPrices, slideIn } from '../lib/motion';
import type { Restaurant } from '../types';

const PRIMARY_CATEGORIES = ['All', 'Pizza', 'Ramen', 'Indian', 'Mexican'];
const MORE_CATEGORIES = ['Thai', 'Burgers', 'Sushi', 'Halal', 'Chinese'];

type Sort = 'cheapest' | 'fastest' | 'rated';

const matchesCategory = (r: Restaurant, cat: string) =>
  cat === 'All' || r.cuisine.includes(cat) || r.dietaryTags.includes(cat);

const matchesQuery = (r: Restaurant, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [r.name, ...r.cuisine, ...r.dietaryTags, ...r.order.map((o) => o.name)]
    .join(' ')
    .toLowerCase()
    .includes(needle);
};

export function Browse() {
  const [params, setParams] = useSearchParams();
  const zip = params.get('zip') || ZIP;
  const query = params.get('q') ?? '';
  const phone = usePhone();

  const [all, setAll] = useState<Restaurant[]>([]);
  const [refreshedAt, setRefreshedAt] = useState(REFRESHED_AT);
  const [source, setSource] = useState<Source>('mock');
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState('All');
  const [showMore, setShowMore] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('cheapest');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRestaurants(zip).then(({ data, source }) => {
      if (!alive) return;
      setAll(data.restaurants);
      setRefreshedAt(data.refreshedAt);
      setSource(source);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [zip]);

  const setQuery = useCallback(
    (q: string) => {
      const next = new URLSearchParams(params);
      if (q) next.set('q', q);
      else next.delete('q');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const visible = useMemo(() => {
    const list = all.filter((r) => {
      const best = bestOffer(r);
      if (!best) return false;
      if (!matchesCategory(r, category)) return false;
      if (!matchesQuery(r, query)) return false;
      if (filters.maxPrice && best.total >= filters.maxPrice) return false;
      if (filters.maxEta && (fastestOffer(r)?.etaMin ?? 999) >= filters.maxEta) return false;
      if (filters.dietary.length && !filters.dietary.every((t) => r.dietaryTags.includes(t))) return false;
      return true;
    });
    const by: Record<Sort, (a: Restaurant, b: Restaurant) => number> = {
      cheapest: (a, b) => (bestOffer(a)?.total ?? 0) - (bestOffer(b)?.total ?? 0),
      fastest: (a, b) => (bestOffer(a)?.etaMin ?? 0) - (bestOffer(b)?.etaMin ?? 0),
      rated: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
    };
    return [...list].sort(by[sort]);
  }, [all, category, query, filters, sort]);

  // Signature reveal: on mount and every re-sort/filter, slide cards in and
  // count the visible prices up from $0.
  const gridRef = useRef<HTMLDivElement>(null);
  const revealKey = visible.map((r) => r.id).join('|') + (phone ? '#m' : '#d');
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-card]'));
    const stopCards = slideIn(cards, 60);
    const stopPrices = countUpPrices(grid);
    return () => {
      stopCards();
      stopPrices();
    };
  }, [revealKey]);

  const pickCategory = (cat: string, el: HTMLElement) => {
    setCategory(cat);
    chipPop(el);
  };

  const filterCount = activeFilterCount(filters);
  const chips = showMore || MORE_CATEGORIES.includes(category)
    ? [...PRIMARY_CATEGORIES, ...MORE_CATEGORIES]
    : PRIMARY_CATEGORIES;
  const showMoreChip = !showMore && !MORE_CATEGORIES.includes(category);

  return (
    <div className="page has-tabbar">
      <TopBar search={{ value: query, onChange: setQuery }} />

      <div className="browse__tools">
        <div className="chips" role="group" aria-label="Category">
          {chips.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`chip${category === cat ? ' chip--active' : ''}`}
              aria-pressed={category === cat}
              onClick={(e) => pickCategory(cat, e.currentTarget)}
            >
              {cat}
            </button>
          ))}
          {showMoreChip && (
            <button type="button" className="chip" onClick={() => setShowMore(true)}>
              More…
            </button>
          )}
        </div>
        <button type="button" className="btn filters-btn" onClick={() => setSheetOpen(true)}>
          <FilterIcon />
          <span>Filters</span>
          {filterCount > 0 && <span className="filters-btn__count">{filterCount}</span>}
        </button>
      </div>

      <div className="browse__head">
        <div>
          <h1 className="browse__title">{phone ? 'Cheapest right now' : 'Cheapest near you right now'}</h1>
          <span className="browse__sub">
            {loading
              ? 'Checking prices on DoorDash, Uber Eats and Grubhub…'
              : `Prices checked ${minutesAgo(refreshedAt).replace('min ago', 'minutes ago')} on DoorDash, Uber Eats and Grubhub${source === 'mock' ? ' · demo data' : ''}`}
          </span>
        </div>
        <label className="sort">
          <span className="muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
            <option value="rated">Top rated</option>
          </select>
          <ChevronDown stroke="currentColor" />
        </label>
      </div>

      <div className="grid" ref={gridRef}>
        {!loading && visible.length === 0 && (
          <div className="empty">
            Nothing matches yet.{' '}
            <button
              type="button"
              onClick={() => {
                setCategory('All');
                setFilters(EMPTY_FILTERS);
                setQuery('');
              }}
            >
              Clear everything
            </button>
          </div>
        )}
        {visible.map((r) => (
          <ResultCard key={r.id} restaurant={r} compact={phone} />
        ))}
      </div>

      <FilterSheet
        open={sheetOpen}
        value={filters}
        resultCount={visible.length}
        onChange={setFilters}
        onClose={() => setSheetOpen(false)}
      />
      <BottomTabs />
    </div>
  );
}

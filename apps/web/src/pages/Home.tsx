import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { CategoryStrip } from '../components/CategoryStrip';
import { Feed } from '../components/Feed';
import { ClearIcon } from '../components/Icons';
import { SortSegment } from '../components/SortSegment';
import { TopBar } from '../components/TopBar';
import { COVERED_ZIPS, PLATFORM_BY_SLUG, ZIP } from '../data/mock';
import { useMockFallback, useRestaurants } from '../hooks/useData';
import { usePrefs } from '../hooks/usePrefs';
import { useToast } from '../hooks/useToast';
import {
  CATEGORY_WORD,
  categoryFromSlug,
  FILTERS,
  matchesCategory,
  matchesFilters,
  matchesQuery,
  SORTS,
  sortBy,
  type Category,
  type FilterKey,
  type Sort,
} from '../lib/filter';
import { chipPop } from '../lib/motion';

const SORT_WORD: Record<Sort, string> = { cheapest: 'Cheapest', fastest: 'Fastest', rated: 'Top rated' };
const DEBOUNCE_MS = 150;
const BAR_KEY = 'forkcast.sampleBarDismissed';

const coverageList = () => {
  const z = [...COVERED_ZIPS];
  return `${z.slice(0, -1).join(', ')} and ${z[z.length - 1]}`;
};

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(BAR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(BAR_KEY, '1');
  } catch {
    /* private mode: forgotten on reload */
  }
}

function freshness(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'updated just now';
  if (minutes === 1) return 'updated 1 min ago';
  if (minutes < 60) return `updated ${minutes} min ago`;
  return 'updated today';
}

export function Home() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const { prefs, setZip } = usePrefs();
  const toast = useToast();
  const { restaurants, refreshedAt, loading, refresh } = useRestaurants();
  const sample = useMockFallback();

  const [input, setInput] = useState(urlQ);
  const [q, setQ] = useState(urlQ);
  // The category lives in the URL (`/?category=sushi`) so a tap is shareable and survives back/forward.
  const category = categoryFromSlug(params.get('category'));
  const setCategory = (cat: Category) => {
    const next = new URLSearchParams(params);
    if (cat === 'All') next.delete('category');
    else next.set('category', cat.toLowerCase());
    setParams(next, { replace: true });
  };
  const [sort, setSort] = useState<Sort>('cheapest');
  const [active, setActive] = useState<FilterKey[]>([]);
  const [barDismissed, setBarDismissed] = useState(readDismissed);

  // Typing filters the feed after a short pause.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(input), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [input]);

  // Keep `?q=` in step with the debounced query (so the URL is shareable) ...
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ... and follow the URL when something else changes it (Home tab, back button).
  useEffect(() => {
    if (urlQ !== q) {
      setInput(urlQ);
      setQ(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const hasQuery = q.trim() !== '';
  const showChips = hasQuery || category !== 'All';
  const filters = showChips ? active : [];

  const visible = useMemo(
    () =>
      sortBy(
        restaurants.filter(
          (r) => r.offers.length > 0 && matchesCategory(r, category) && matchesQuery(r, q) && matchesFilters(r, filters),
        ),
        sort,
      ),
    [restaurants, category, q, filters, sort],
  );

  const toggleFilter = (key: FilterKey, el: Element) => {
    setActive((a) => (a.includes(key) ? a.filter((k) => k !== key) : [...a, key]));
    chipPop(el);
  };

  const clearAll = () => {
    setInput('');
    setQ('');
    setActive([]);
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('category');
    setParams(next, { replace: true });
  };

  const noCoverage = !loading && restaurants.length === 0;
  const heading =
    category === 'All' ? `${SORT_WORD[sort]} near you` : `${SORT_WORD[sort]} ${CATEGORY_WORD[category]} near you`;
  const count = `${visible.length} place${visible.length === 1 ? '' : 's'}`;
  const passes = prefs.subscriptions.map((s) => PLATFORM_BY_SLUG[s].subscriptionName);
  const passLine =
    passes.length === 0
      ? null
      : passes.length === 1
        ? `Your ${passes[0]} is applied`
        : `Your ${passes.slice(0, -1).join(', ')} and ${passes[passes.length - 1]} are applied`;

  let emptyText: string;
  if (hasQuery) {
    emptyText = `Nothing matches “${q.trim()}”${category !== 'All' ? ` in ${category}` : ''}${filters.length ? ' with these filters' : ''}.`;
  } else if (category !== 'All') {
    emptyText = filters.length ? `Nothing in ${category} matches these filters.` : `Nothing in ${category} near you yet.`;
  } else {
    emptyText = 'Nothing near you yet.';
  }

  return (
    <div className="page">
      <TopBar search={{ value: input, onChange: setInput }} />

      {sample && !barDismissed && (
        <div className="bar" role="status">
          <span>Demo prices are on. Totals are simulated and clearly separated from live platform data.</span>
          <button
            type="button"
            className="bar__close"
            aria-label="Dismiss"
            onClick={() => {
              writeDismissed();
              setBarDismissed(true);
            }}
          >
            <ClearIcon size={16} />
          </button>
        </div>
      )}

      <CategoryStrip value={category} onChange={setCategory} />

      {showChips && (
        <div className="chips" role="group" aria-label="Filters">
          {FILTERS.map((f) => {
            const on = active.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className={`chip${on ? ' chip--active' : ''}`}
                aria-pressed={on}
                onClick={(e) => toggleFilter(f.key, e.currentTarget)}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="trust">Same order on DoorDash, Uber Eats and Grubhub</p>

      <div className="section-head">
        <div>
          <h2 className="section-head__title">{heading}</h2>
          <span className="section-head__sub">
            {loading
              ? 'Checking three apps…'
              : noCoverage
                ? 'No prices for this zip'
                : `${count}${hasQuery ? ` for “${q.trim()}”` : ''} · ${freshness(refreshedAt)}`}
          </span>
          {passLine && !loading && <span className="section-head__pass">{passLine}</span>}
        </div>
        <div className="section-head__actions">
          <button type="button" className="refresh" onClick={refresh} disabled={loading} aria-label="Refresh prices">
            Refresh
          </button>
          <SortSegment options={SORTS} value={sort} onChange={setSort} label="Sort by" />
        </div>
      </div>

      {noCoverage ? (
        <Feed
          restaurants={[]}
          loading={false}
          emptyText={`We only cover Pittsburgh zips ${coverageList()} right now.`}
          action={{
            label: `Use ${ZIP}`,
            onClick: () => {
              setZip(ZIP);
              toast('Prices updated');
            },
          }}
        />
      ) : (
        <Feed
          restaurants={visible}
          loading={loading}
          sort={sort}
          emptyText={emptyText}
          action={hasQuery || showChips ? { label: hasQuery ? 'Clear search' : 'Clear filters', onClick: clearAll } : undefined}
        />
      )}

      <BottomTabs />
    </div>
  );
}

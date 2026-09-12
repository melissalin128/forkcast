import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { CategoryStrip } from '../components/CategoryStrip';
import { DealsStrip } from '../components/DealsStrip';
import { Feed } from '../components/Feed';
import { FilterBar } from '../components/FilterBar';
import { ClearIcon } from '../components/Icons';
import { SortSegment } from '../components/SortSegment';
import { TopBar } from '../components/TopBar';
import { COVERED_ZIPS, PLATFORM_BY_SLUG, ZIP } from '../data/mock';
import { useMockFallback, usePromos, useRestaurants } from '../hooks/useData';
import { usePrefs } from '../hooks/usePrefs';
import { useToast } from '../hooks/useToast';
import {
  CATEGORY_WORD,
  categoryFromSlug,
  filtersFromParam,
  forYou,
  matchesCategory,
  matchesFilters,
  matchesQuery,
  queryLabel,
  SORTS,
  sortBy,
  sortFromParam,
  type Category,
  type FilterKey,
  type Sort,
} from '../lib/filter';
import { chipPop } from '../lib/motion';

const SORT_WORD: Record<Sort, string> = {
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  rated: 'Top rated',
  cheapestFee: 'Lowest fee',
};
const DEBOUNCE_MS = 150;
const BAR_KEY = 'forkcast.sampleBarDismissed';
const ONBOARD_KEY = 'forkcast.onboarded';

const coverageList = () => {
  const z = [...COVERED_ZIPS];
  return `${z.slice(0, -1).join(', ')} and ${z[z.length - 1]}`;
};

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1' || localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, store: 'session' | 'local' = 'session') {
  try {
    (store === 'local' ? localStorage : sessionStorage).setItem(key, '1');
  } catch {
    /* private mode */
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
  const { promos } = usePromos();
  const sample = useMockFallback();

  const [input, setInput] = useState(urlQ);
  const [q, setQ] = useState(urlQ);
  const category = categoryFromSlug(params.get('category'));
  const setCategory = (cat: Category) => {
    const next = new URLSearchParams(params);
    if (cat === 'All') next.delete('category');
    else next.set('category', cat.toLowerCase());
    setParams(next, { replace: true });
  };
  const sort = sortFromParam(params.get('sort'));
  const setSort = (value: Sort) => {
    const next = new URLSearchParams(params);
    if (value === 'cheapest') next.delete('sort');
    else next.set('sort', value);
    setParams(next, { replace: true });
  };
  const active = filtersFromParam(params.get('filters'));
  const setActive = (nextFilters: FilterKey[]) => {
    const next = new URLSearchParams(params);
    if (nextFilters.length) next.set('filters', nextFilters.join(','));
    else next.delete('filters');
    setParams(next, { replace: true });
  };
  const [barDismissed, setBarDismissed] = useState(() => readFlag(BAR_KEY));
  const [onboarded, setOnboarded] = useState(() => readFlag(ONBOARD_KEY));

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (urlQ !== q) {
      setInput(urlQ);
      setQ(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const hasQuery = q.trim() !== '';
  const hasCombo = hasQuery || category !== 'All' || active.length > 0;

  const visible = useMemo(
    () =>
      sortBy(
        restaurants.filter(
          (r) => r.offers.length > 0 && matchesCategory(r, category) && matchesQuery(r, q) && matchesFilters(r, active),
        ),
        sort,
      ),
    [restaurants, category, q, active, sort],
  );

  const picks = useMemo(() => (hasCombo ? [] : forYou(restaurants, prefs)), [hasCombo, restaurants, prefs]);

  const toggleFilter = (key: FilterKey) => {
    setActive(active.includes(key) ? active.filter((k) => k !== key) : [...active, key]);
  };

  const clearAll = () => {
    setInput('');
    setQ('');
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('category');
    next.delete('filters');
    setParams(next, { replace: true });
  };

  const noCoverage = !loading && restaurants.length === 0;
  const heading =
    category === 'All' ? `${SORT_WORD[sort]} near you` : `${SORT_WORD[sort]} ${CATEGORY_WORD[category]} near you`;
  const count = `${visible.length} place${visible.length === 1 ? '' : 's'}`;
  const combo = queryLabel(category, active, q);
  const passes = prefs.subscriptions.map((s) => PLATFORM_BY_SLUG[s].subscriptionName);
  const passLine =
    passes.length === 0
      ? null
      : passes.length === 1
        ? `Your ${passes[0]} is applied`
        : `Your ${passes.slice(0, -1).join(', ')} and ${passes[passes.length - 1]} are applied`;

  let emptyText: string;
  if (hasQuery || active.length || category !== 'All') {
    emptyText = `Nothing matches ${combo || 'these filters'}.`;
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
              writeFlag(BAR_KEY);
              setBarDismissed(true);
            }}
          >
            <ClearIcon size={16} />
          </button>
        </div>
      )}

      {!onboarded && (
        <section className="onboard" aria-label="Set up Forkcast">
          <div>
            <h3 className="onboard__title">Delivering to {prefs.zip}</h3>
            <p className="onboard__sub">
              Add your zip, passes, and taste preferences in Account. Combined filters like Italian · under $20 · 30
              min live on this feed.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--accent onboard__btn"
            onClick={() => {
              writeFlag(ONBOARD_KEY, 'local');
              setOnboarded(true);
              chipPop(document.body);
              toast('You can change zip, passes and diet anytime');
            }}
          >
            Got it
          </button>
        </section>
      )}

      <CategoryStrip value={category} onChange={setCategory} />
      <FilterBar
        category={category}
        query={q}
        active={active}
        onToggle={toggleFilter}
        onClear={clearAll}
        resultCount={visible.length}
      />

      <p className="trust">Same order on DoorDash, Uber Eats and Grubhub</p>

      {!hasCombo && !loading && <DealsStrip promos={promos} restaurants={restaurants} />}

      {picks.length > 0 && (
        <section className="foryou" aria-label="HawtPix picks">
          <div className="deals__head">
            <h3 className="deals__title">For you · HawtPix</h3>
            <span className="deals__sub">From your saved places, cuisines and diet — not the crowd</span>
          </div>
          <div className="foryou__grid">
            {picks.map((r) => (
              <Link key={r.id} to={`/store/${r.id}`} className="foryou__card">
                <span className="foryou__name">{r.name}</span>
                <span className="foryou__meta">{r.cuisine[0]} · {r.dietaryTags[0] ?? 'your tastes'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="section-head">
        <div>
          <h2 className="section-head__title">{heading}</h2>
          <span className="section-head__sub">
            {loading
              ? 'Checking three apps…'
              : noCoverage
                ? 'No prices for this zip'
                : `${count}${combo ? ` · ${combo}` : ''} · ${freshness(refreshedAt)}`}
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
          action={hasCombo ? { label: 'Clear filters', onClick: clearAll } : undefined}
        />
      )}

      <BottomTabs />
    </div>
  );
}

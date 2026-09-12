import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomTabs } from '../components/BottomTabs';
import { CategoryStrip } from '../components/CategoryStrip';
import { Feed } from '../components/Feed';
import { PlatformDot } from '../components/PlatformDot';
import { SortSegment } from '../components/SortSegment';
import { TopBar } from '../components/TopBar';
import { PLATFORMS } from '../data/mock';
import { useRestaurants } from '../hooks/useData';
import { minutesAgo } from '../lib/analysis';
import { matchesCategory, matchesQuery, SORTS, sortBy, type Sort } from '../lib/filter';

export function Home() {
  const nav = useNavigate();
  const { restaurants, loading, refreshedAt, source } = useRestaurants();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<Sort>('cheapest');

  const visible = useMemo(
    () => sortBy(restaurants.filter((r) => r.offers.length > 0 && matchesCategory(r, category) && matchesQuery(r, q)), sort),
    [restaurants, category, q, sort],
  );

  return (
    <div className="page">
      <TopBar
        search={{
          value: q,
          onChange: setQ,
          onSubmit: (v) => nav(v.trim() ? `/search?q=${encodeURIComponent(v.trim())}` : '/search'),
        }}
      />

      <CategoryStrip value={category} onChange={setCategory} />

      <p className="trust">
        <span>Compares</span>
        {PLATFORMS.map((p) => (
          <span key={p.slug} className="trust__app">
            <PlatformDot slug={p.slug} />
            {p.name}
          </span>
        ))}
      </p>

      <div className="section-head">
        <div>
          <h2 className="section-head__title">{category === 'All' ? 'Cheapest near you' : `${category} near you`}</h2>
          <span className="section-head__sub">
            {loading
              ? 'Checking three apps…'
              : `${visible.length} place${visible.length === 1 ? '' : 's'} · prices checked ${minutesAgo(refreshedAt)}${source === 'mock' ? ' · demo data' : ''}`}
          </span>
        </div>
        <SortSegment options={SORTS} value={sort} onChange={setSort} label="Sort by" />
      </div>

      <Feed
        restaurants={visible}
        loading={loading}
        emptyText={q ? `Nothing matches “${q}” in ${category === 'All' ? 'your area' : category}.` : `No ${category} places near you yet.`}
        onClear={() => {
          setQ('');
          setCategory('All');
        }}
      />

      <BottomTabs />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryStrip } from '../../src/components/CategoryStrip';
import { Feed } from '../../src/components/Feed';
import { ClearIcon } from '../../src/components/Icons';
import { SortSegment } from '../../src/components/SortSegment';
import { TopBar } from '../../src/components/TopBar';
import { COVERED_ZIPS, PLATFORM_BY_SLUG, ZIP } from '../../src/data/mock';
import { useMockFallback, useRestaurants } from '../../src/hooks/useData';
import { usePrefs } from '../../src/hooks/usePrefs';
import { useToast } from '../../src/hooks/useToast';
import {
  CATEGORY_WORD,
  FILTERS,
  matchesCategory,
  matchesFilters,
  matchesQuery,
  SORTS,
  sortBy,
  type Category,
  type FilterKey,
  type Sort,
} from '../../src/lib/filter';
import { C, GUTTER, R } from '../../src/theme';

const SORT_WORD: Record<Sort, string> = { cheapest: 'Cheapest', fastest: 'Fastest', rated: 'Top rated' };
const DEBOUNCE_MS = 150;

const coverageList = () => {
  const z = [...COVERED_ZIPS];
  return `${z.slice(0, -1).join(', ')} and ${z[z.length - 1]}`;
};

function freshness(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'updated just now';
  if (minutes === 1) return 'updated 1 min ago';
  if (minutes < 60) return `updated ${minutes} min ago`;
  return 'updated today';
}

/** Once dismissed the sample bar stays hidden until the app restarts (sessionStorage on the web). */
let barDismissedThisSession = false;

export default function Home() {
  const { prefs, setZip } = usePrefs();
  const toast = useToast();
  const { restaurants, refreshedAt, loading, refresh } = useRestaurants();
  const sample = useMockFallback();

  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [sort, setSort] = useState<Sort>('cheapest');
  const [active, setActive] = useState<FilterKey[]>([]);
  const [barDismissed, setBarDismissed] = useState(barDismissedThisSession);

  // Typing filters the feed after a short pause.
  useEffect(() => {
    const t = setTimeout(() => setQ(input), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

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

  const toggleFilter = (key: FilterKey) =>
    setActive((a) => (a.includes(key) ? a.filter((k) => k !== key) : [...a, key]));

  const clearAll = () => {
    setInput('');
    setQ('');
    setCategory('All');
    setActive([]);
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

  const header = (
    <View>
      {sample && !barDismissed && (
        <View accessibilityRole="alert" style={styles.bar}>
          <Text style={styles.barText}>Demo prices are on. Totals are simulated and separated from live platform data.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={8}
            onPress={() => {
              barDismissedThisSession = true;
              setBarDismissed(true);
            }}
          >
            <ClearIcon size={16} stroke={C.accentInk} />
          </Pressable>
        </View>
      )}

      <CategoryStrip value={category} onChange={setCategory} />

      {showChips && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Filters">
          {FILTERS.map((f) => {
            const on = active.includes(f.key);
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => toggleFilter(f.key)}
                style={[styles.chip, on && styles.chipActive]}
              >
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Text style={styles.trust}>Same order on DoorDash, Uber Eats and Grubhub</Text>

      <View style={styles.sectionHead}>
        <View style={styles.sectionText}>
          <Text style={styles.sectionTitle}>{heading}</Text>
          <Text style={styles.sectionSub}>
            {loading
              ? 'Checking three apps…'
              : noCoverage
                ? 'No prices for this zip'
                : `${count}${hasQuery ? ` for “${q.trim()}”` : ''} · ${freshness(refreshedAt)}`}
          </Text>
          {passLine && !loading && <Text style={styles.sectionPass}>{passLine}</Text>}
        </View>
        <SortSegment options={SORTS} value={sort} onChange={setSort} label="Sort by" />
      </View>
    </View>
  );

  return (
    <View style={styles.page}>
      <TopBar search={{ value: input, onChange: setInput }} />
      {noCoverage ? (
        <Feed
          header={header}
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
          refreshing={loading}
          onRefresh={refresh}
        />
      ) : (
        <Feed
          header={header}
          restaurants={visible}
          loading={loading}
          sort={sort}
          emptyText={emptyText}
          action={hasQuery || showChips ? { label: hasQuery ? 'Clear search' : 'Clear filters', onClick: clearAll } : undefined}
          refreshing={loading}
          onRefresh={refresh}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: GUTTER,
    backgroundColor: C.accentBg,
    borderBottomWidth: 1,
    borderBottomColor: C.accentLine,
  },
  barText: { color: C.accentInk, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chips: { flexDirection: 'row', gap: 8, paddingTop: 4, paddingHorizontal: GUTTER, paddingBottom: 6 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    justifyContent: 'center',
  },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentBg },
  chipText: { fontSize: 13, fontWeight: '600', color: C.fg },
  chipTextActive: { color: C.accentInk },
  trust: { paddingTop: 4, paddingHorizontal: GUTTER, paddingBottom: 6, fontSize: 12, color: C.muted },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: GUTTER,
    paddingBottom: 10,
  },
  sectionText: { minWidth: 0, flexShrink: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, lineHeight: 22, color: C.fg },
  sectionSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  sectionPass: { fontSize: 12, color: C.accentInk, fontWeight: '600', marginTop: 2 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompareStrip } from '../../src/components/CompareStrip';
import { ExternalIcon, StarIcon } from '../../src/components/Icons';
import { Photo } from '../../src/components/Photo';
import { PlatformLedger } from '../../src/components/PlatformLedger';
import { PriceHistory } from '../../src/components/PriceHistory';
import { TopBar } from '../../src/components/TopBar';
import { Card, Notice } from '../../src/components/ui';
import { PLATFORMS } from '../../src/data/mock';
import { useStore } from '../../src/hooks/useData';
import {
  bestOffer,
  bestTime,
  cheapestMenuPlatform,
  deepLink,
  etaRange,
  menuFor,
  money,
  platformName,
  ratingCount,
  savingsTail,
  windowLabel,
} from '../../src/lib/analysis';
import { restaurantPhoto } from '../../src/lib/photos';
import { C, GUTTER, R, num } from '../../src/theme';
import type { Restaurant } from '../../src/types';

type Tab = 'menu' | 'prices';

/** No bottom tab bar here: the sticky "Order on …" button is the only bottom element. */
export default function Store() {
  const params = useLocalSearchParams();
  const id = String(params.id ?? '');
  const wantsPrices = params.tab === 'prices';
  const [tab, setTab] = useState<Tab>(wantsPrices ? 'prices' : 'menu');
  const { restaurant, snapshots } = useStore(id);
  const insets = useSafeAreaInsets();
  // `.cover`: 200px, 160px on narrow screens (web's `max-width: 480px` breakpoint).
  const { width } = useWindowDimensions();
  const coverH = width <= 480 ? 160 : 200;

  // Follow the URL when something else changes it (Savings opens the Prices tab).
  useEffect(() => {
    setTab(wantsPrices ? 'prices' : 'menu');
  }, [wantsPrices, id]);

  const best = restaurant ? bestOffer(restaurant) : undefined;
  const timing = useMemo(() => (best ? bestTime(snapshots, best.platformSlug) : null), [snapshots, best]);

  if (restaurant === undefined) {
    return (
      <View style={styles.page}>
        <TopBar back={{ title: 'Loading…' }} />
        <Notice>Checking three apps…</Notice>
      </View>
    );
  }

  if (!restaurant || !best) {
    return (
      <View style={styles.page}>
        <TopBar back={{ title: 'Not found' }} />
        <Notice>
          We could not find that place near you.{' '}
          <Text style={styles.link} onPress={() => router.replace('/')}>
            Back home
          </Text>
          .
        </Notice>
      </View>
    );
  }

  const r = restaurant;
  const bestName = platformName(best.platformSlug);
  const ctaH = 52 + 20 + insets.bottom;

  return (
    <View style={styles.page}>
      <TopBar back={{ title: r.name }} />

      <ScrollView contentContainerStyle={{ paddingBottom: ctaH + 12 }} stickyHeaderIndices={[1]}>
        <View>
          <Photo source={restaurantPhoto(r)} fallback={r.image} iconSize={40} style={[styles.cover, { height: coverH }]} />

          <View style={styles.store}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.meta}>
              <StarIcon stroke={C.fg} /> <Text style={[num, styles.fg]}>{r.rating.toFixed(1)}</Text> ({ratingCount(r.ratingCount)})
              {' · '}
              {r.cuisine.join(', ')}
              {' · '}
              <Text style={[num, styles.fg]}>{r.distanceMi} mi</Text>
              {' · '}
              <Text style={[num, styles.fg]}>{etaRange(best)}</Text>
              {' · '}open until {r.openUntil}
            </Text>
            <CompareStrip restaurant={r} />
            <Text style={styles.forLine} numberOfLines={1}>
              For {r.orderLabel}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.strong}>Cheapest on {bestName}</Text> · {savingsTail(r)}
            </Text>
          </View>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {(['menu', 'prices'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'menu' ? 'Menu' : 'Prices'}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'menu' ? (
          <MenuTab restaurant={r} />
        ) : (
          <View style={styles.prices}>
            <PlatformLedger restaurant={r} />

            <Card>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Price over the last 7 days</Text>
                <View style={styles.legend}>
                  {PLATFORMS.map((p) => (
                    <View key={p.slug} style={styles.legendItem}>
                      <View style={[styles.legendLine, { backgroundColor: p.brandColor }]} />
                      <Text style={styles.legendText}>{p.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <PriceHistory snapshots={snapshots} highlight={best.platformSlug} band={timing?.best} />
              <Text style={styles.foot}>
                {timing
                  ? `Usually cheapest ${windowLabel(timing.best.dow, timing.best.hour)}, around ${money(timing.best.avg)}.`
                  : 'We will show the cheapest hours once we have a week of prices.'}
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: 10 + insets.bottom }]}>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(deepLink(best.platformSlug, r))}
          style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>
            Order on {bestName} · <Text style={num}>{money(best.total)}</Text>
          </Text>
          <ExternalIcon stroke={C.white} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function MenuTab({ restaurant: r }: { restaurant: Restaurant }) {
  const items = menuFor(r);
  const listed = PLATFORMS.filter((p) => r.offers.some((o) => o.platformSlug === p.slug));
  const cols = PLATFORMS;
  return (
    <View style={styles.menu}>
      <View style={[styles.menuRow, styles.menuHead]}>
        <Text style={[styles.menuHeadText, styles.menuName]}>ITEM</Text>
        {cols.map((p) => (
          <Text key={p.slug} style={[styles.menuHeadText, styles.menuPlat]}>
            {p.name.replace('Uber Eats', 'Uber')}
          </Text>
        ))}
      </View>
      {items.map((item) => {
        const cheapest = listed.length > 1 ? cheapestMenuPlatform(item) : undefined;
        return (
          <View key={item.name} style={styles.menuRow}>
            <Text style={styles.menuName}>{item.name}</Text>
            {cols.map((p) => {
              const v = item.prices[p.slug];
              return (
                <Text
                  key={p.slug}
                  style={[
                    styles.menuPrice,
                    num,
                    v === undefined && styles.menuPriceNone,
                    cheapest === p.slug && styles.menuPriceBest,
                  ]}
                >
                  {v === undefined ? '—' : money(v)}
                </Text>
              );
            })}
          </View>
        );
      })}
      <Text style={[styles.foot, styles.menuFoot]}>
        Menu prices before fees, tax and tip. Fees change the answer — see the Prices tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  link: { color: C.accentInk, fontWeight: '600' },
  cover: { width: '100%' },
  store: {
    paddingTop: 14,
    paddingHorizontal: GUTTER,
    paddingBottom: 12,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  name: { fontSize: 22, fontWeight: '700', letterSpacing: -0.44, lineHeight: 26, color: C.fg },
  meta: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 19 },
  fg: { color: C.fg },
  forLine: { marginTop: 8, fontSize: 12, color: C.muted },
  line: { marginTop: 3, fontSize: 13, color: C.muted },
  strong: { color: C.winInk, fontWeight: '700' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  tab: { flex: 1, paddingTop: 13, paddingBottom: 11, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.fg },
  // menu tab
  menu: { backgroundColor: C.card, paddingTop: 4, paddingHorizontal: GUTTER, paddingBottom: 8 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  menuHead: { paddingTop: 8, paddingBottom: 6 },
  menuHeadText: { fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 0.4 },
  menuPlat: { width: 64, textAlign: 'right', letterSpacing: 0 },
  menuName: { flex: 1, fontSize: 14, fontWeight: '500', color: C.fg, minWidth: 0 },
  menuPrice: { width: 64, textAlign: 'right', fontSize: 13, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 6, color: C.fg },
  menuPriceNone: { color: C.muted },
  menuPriceBest: { color: C.winInk, backgroundColor: C.winBg },
  menuFoot: { paddingTop: 10 },
  // prices tab
  prices: { gap: 12, paddingTop: 12, paddingHorizontal: GUTTER },
  cardHead: { gap: 2, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15, color: C.fg },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendText: { fontSize: 12, color: C.muted },
  foot: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 18 },
  // sticky CTA
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: GUTTER,
    backgroundColor: C.page,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  ctaBtn: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: R.card,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.85 },
  ctaText: { color: C.white, fontWeight: '700', fontSize: 15 },
});

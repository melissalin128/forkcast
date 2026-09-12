import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Photo } from '../../src/components/Photo';
import { TopBar } from '../../src/components/TopBar';
import { Card, Notice } from '../../src/components/ui';
import { PLATFORMS } from '../../src/data/mock';
import { usePromos, useRestaurants } from '../../src/hooks/useData';
import { activeDeals, bestOffer, money, platformName, saving, worstOffer } from '../../src/lib/analysis';
import { restaurantPhoto } from '../../src/lib/photos';
import { C, GUTTER, R, num } from '../../src/theme';

/** Where picking the cheapest app matters most: the gap between cheapest and priciest, per restaurant. */
export default function Savings() {
  const { restaurants, loading } = useRestaurants();
  const { promos } = usePromos();
  const livePromos = promos.filter((p) => new Date(p.endsAt).getTime() > Date.now());
  const promoHits = restaurants
    .map((r) => ({ r, deals: activeDeals(r) }))
    .filter((x) => x.deals.length > 0)
    .sort((a, b) => Math.max(...b.deals.map((d) => d.promoDiscount)) - Math.max(...a.deals.map((d) => d.promoDiscount)));

  const rows = useMemo(
    () =>
      restaurants
        .filter((r) => r.offers.length > 1)
        .map((r) => ({ r, save: saving(r), best: bestOffer(r)!, worst: worstOffer(r)! }))
        .filter((x) => x.save >= 0.05)
        .sort((a, b) => b.save - a.save),
    [restaurants],
  );

  const header = (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Deals by app</Text>
        <Text style={styles.sectionSub}>Simulated demo promos. Already folded into Home totals.</Text>
      </View>
      {PLATFORMS.map((p) => {
        const list = livePromos.filter((promo) => promo.platformSlug === p.slug);
        return (
          <Card key={p.slug} style={styles.platCard}>
            <Text style={[styles.platName, { color: p.brandColor }]}>{p.name}</Text>
            {list.length === 0 ? (
              <Text style={styles.sectionSub}>No live demo promo on {p.name} right now.</Text>
            ) : (
              list.map((promo) => (
                <Text key={promo.code} style={styles.promoLine}>
                  {promo.code} · {promo.description ?? promo.label}
                </Text>
              ))
            )}
          </Card>
        );
      })}
      {promoHits.length > 0 && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Promos already in a total</Text>
          <Text style={styles.sectionSub}>Same representative order. Demo-labeled.</Text>
        </View>
      )}
      {promoHits.map(({ r, deals }) => {
        const top = [...deals].sort((a, b) => b.promoDiscount - a.promoDiscount)[0];
        return (
          <Pressable
            key={`promo-${r.id}`}
            onPress={() => router.push({ pathname: '/store/[id]', params: { id: r.id, tab: 'prices' } })}
            style={styles.save}
          >
            <Photo source={restaurantPhoto(r)} fallback={r.image} iconSize={18} style={styles.thumb} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.detail}>
                {platformName(top.platformSlug)} · <Text style={styles.amt}>{money(top.promoDiscount)} off</Text>
              </Text>
            </View>
          </Pressable>
        );
      })}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Where you save the most</Text>
        <Text style={styles.sectionSub}>
          {loading ? 'Checking three apps…' : 'Cheapest app vs priciest app, same order · Prices from today'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.page}>
      <TopBar title="Savings" />
      <FlatList
        data={loading ? [] : rows}
        keyExtractor={(x) => x.r.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Notice>{loading ? 'Checking three apps…' : 'Every app charges about the same near you right now.'}</Notice>
        }
        renderItem={({ item: { r, save, best, worst } }) => (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/store/[id]', params: { id: r.id, tab: 'prices' } })}
            style={({ pressed }) => [styles.save, pressed && styles.pressed]}
          >
            <Photo source={restaurantPhoto(r)} fallback={r.image} iconSize={18} style={styles.thumb} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.detail}>
                {platformName(best.platformSlug)} <Text style={[num, styles.fg]}>{money(best.total)}</Text> ·{' '}
                <Text style={styles.amt}> save {money(save)} </Text> vs {platformName(worst.platformSlug)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  sectionHead: { paddingTop: 8, paddingHorizontal: GUTTER, paddingBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, lineHeight: 22, color: C.fg },
  sectionSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  platCard: { marginHorizontal: GUTTER, marginBottom: 8 },
  platName: { fontSize: 15, fontWeight: '700' },
  promoLine: { fontSize: 13, color: C.fg, marginTop: 6 },
  list: { paddingBottom: 16, gap: 8 },
  save: {
    marginHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingRight: 14,
    paddingBottom: 10,
    paddingLeft: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
  },
  pressed: { backgroundColor: '#fcfbf9' },
  thumb: { width: 48, height: 48, borderRadius: 24 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontWeight: '700', fontSize: 15, color: C.fg },
  detail: { fontSize: 13, color: C.muted, lineHeight: 21 },
  fg: { color: C.fg },
  // The saving, in win ink on a mint pill.
  amt: { color: C.winInk, fontWeight: '700', backgroundColor: C.winBg, borderRadius: R.pill, overflow: 'hidden' },
});

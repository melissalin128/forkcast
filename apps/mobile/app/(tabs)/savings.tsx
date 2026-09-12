import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { Notice } from '../../src/components/ui';
import { useRestaurants } from '../../src/hooks/useData';
import { bestOffer, money, platformName, saving, worstOffer } from '../../src/lib/analysis';
import { C, GUTTER, R, num } from '../../src/theme';

/** Where picking the cheapest app matters most: the gap between cheapest and priciest, per restaurant. */
export default function Savings() {
  const { restaurants, loading } = useRestaurants();

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
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Where you save the most</Text>
      <Text style={styles.sectionSub}>
        {loading ? 'Checking three apps…' : 'Cheapest app vs priciest app, same order · Prices from today'}
      </Text>
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
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.detail}>
              {platformName(best.platformSlug)} <Text style={[num, styles.fg]}>{money(best.total)}</Text> ·{' '}
              <Text style={styles.amt}>save {money(save)}</Text> vs {platformName(worst.platformSlug)}
            </Text>
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
  list: { paddingBottom: 16, gap: 8 },
  save: {
    marginHorizontal: GUTTER,
    gap: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
  },
  pressed: { backgroundColor: '#fcfbf9' },
  name: { fontWeight: '700', fontSize: 15, color: C.fg },
  detail: { fontSize: 13, color: C.muted, lineHeight: 19 },
  fg: { color: C.fg },
  amt: { color: C.winInk, fontWeight: '700' },
});

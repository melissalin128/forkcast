import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PromosResponse } from '../api/client';
import { PLATFORM_BY_SLUG } from '../data/mock';
import { activeDeals, money, platformName } from '../lib/analysis';
import { C, GUTTER, R } from '../theme';
import type { Restaurant } from '../types';

interface Props {
  promos: PromosResponse['promos'];
  restaurants: Restaurant[];
}

function hoursLeft(p: PromosResponse['promos'][number]): string {
  if (typeof p.hoursLeft === 'number') return p.hoursLeft < 24 ? `${p.hoursLeft}h left` : `${Math.round(p.hoursLeft / 24)}d left`;
  const hours = Math.round((new Date(p.endsAt).getTime() - Date.now()) / 36e5);
  if (!Number.isFinite(hours) || hours <= 0) return 'ends soon';
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

export function DealsStrip({ promos, restaurants }: Props) {
  const live = promos.filter((p) => new Date(p.endsAt).getTime() > Date.now());
  const hits = restaurants
    .map((r) => ({ r, deals: activeDeals(r) }))
    .filter((x) => x.deals.length > 0)
    .slice(0, 8);
  if (live.length === 0 && hits.length === 0) return null;

  return (
    <View style={styles.wrap} accessibilityLabel="Best deals right now">
      <View style={styles.head}>
        <Text style={styles.title}>Best deals right now</Text>
        <Text style={styles.sub}>Simulated demo promos · already in the totals</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {live.map((p) => {
          const plat = PLATFORM_BY_SLUG[p.platformSlug];
          return (
            <Pressable key={`${p.platformSlug}-${p.code}`} onPress={() => router.push('/savings')} style={styles.card}>
              <Text style={[styles.plat, { color: plat.brandColor }]}>{plat.name}</Text>
              <Text style={styles.code}>{p.code}</Text>
              <Text style={styles.desc}>{p.description ?? p.label}</Text>
              <Text style={styles.time}>{hoursLeft(p)}</Text>
            </Pressable>
          );
        })}
        {hits.map(({ r, deals }) => {
          const best = [...deals].sort((a, b) => b.promoDiscount - a.promoDiscount)[0];
          return (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/store/[id]', params: { id: r.id, tab: 'prices' } })}
              style={styles.card}
            >
              <Text style={[styles.plat, { color: PLATFORM_BY_SLUG[best.platformSlug].brandColor }]}>
                {platformName(best.platformSlug)}
              </Text>
              <Text style={styles.code} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.desc}>
                {money(best.promoDiscount)} off · {money(best.total)}
              </Text>
              <Text style={styles.time}>{best.promo?.code ?? 'promo applied'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 8 },
  head: { paddingHorizontal: GUTTER, paddingBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15, color: C.fg },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  row: { paddingHorizontal: GUTTER, gap: 8 },
  card: {
    width: 168,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
    gap: 2,
  },
  plat: { fontSize: 11, fontWeight: '700' },
  code: { fontSize: 14, fontWeight: '700', letterSpacing: -0.14, color: C.fg },
  desc: { fontSize: 12, color: C.muted },
  time: { fontSize: 12, color: C.muted },
});

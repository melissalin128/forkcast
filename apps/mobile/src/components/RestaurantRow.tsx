import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  bestOffer,
  etaRange,
  fastestOffer,
  orderSummary,
  platformName,
  ratingCount,
  savingsTail,
} from '../lib/analysis';
import type { Sort } from '../lib/filter';
import { C, R, num } from '../theme';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { categoryIcon, StarIcon } from './Icons';
import { Gradient } from './ui';

interface Props {
  restaurant: Restaurant;
  /** Under "Fastest" the highlight and the last line talk about time instead of price. */
  sort?: Sort;
}

/** Feed card: thumbnail + name + meta, the compare strip, what the price is for, one verdict line. */
export function RestaurantRow({ restaurant: r, sort = 'cheapest' }: Props) {
  const best = bestOffer(r);
  const fastest = fastestOffer(r);
  if (!best || !fastest) return null;
  const Icon = categoryIcon(r.category);
  const byTime = sort === 'fastest';

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/store/${r.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.head}>
        <View style={styles.thumb}>
          <Gradient css={r.image} radius={10} />
          <Icon size={24} stroke="rgba(255,255,255,0.92)" strokeWidth={1.8} />
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {r.name}
          </Text>
          <View style={styles.meta}>
            <StarIcon stroke={C.fg} />
            <Text style={styles.metaText} numberOfLines={1}>
              <Text style={[num, styles.fg]}>{r.rating.toFixed(1)}</Text> ({ratingCount(r.ratingCount)}) · {r.cuisine[0]} ·{' '}
              <Text style={[num, styles.fg]}>{r.distanceMi} mi</Text>
            </Text>
          </View>
        </View>
      </View>

      <CompareStrip restaurant={r} highlight={byTime ? 'fastest' : 'cheapest'} />

      <Text style={styles.forLine} numberOfLines={1}>
        For {orderSummary(r)}, delivered
      </Text>

      <Text style={styles.line}>
        {byTime ? (
          <>
            <Text style={styles.strong}>Fastest on {platformName(fastest.platformSlug)}</Text> · {etaRange(fastest)}
          </>
        ) : (
          <>
            <Text style={styles.strong}>Cheapest on {platformName(best.platformSlug)}</Text> · {savingsTail(r)}
          </>
        )}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
    padding: 12,
  },
  rowPressed: { backgroundColor: '#fcfbf9' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.inset,
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.16, color: C.fg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 13, color: C.muted, flexShrink: 1 },
  fg: { color: C.fg },
  forLine: { marginTop: 8, fontSize: 12, color: C.muted },
  line: { marginTop: 3, fontSize: 13, color: C.muted },
  strong: { color: C.winInk, fontWeight: '700' },
});

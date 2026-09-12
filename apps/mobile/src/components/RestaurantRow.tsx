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
import { restaurantPhoto } from '../lib/photos';
import { C, R, num } from '../theme';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { StarIcon } from './Icons';
import { Photo } from './Photo';

interface Props {
  restaurant: Restaurant;
  /** Under "Fastest" the highlight and the last line talk about time instead of price. */
  sort?: Sort;
}

/** Feed card: 16:9 photo, name + meta, the compare strip, what the price is for, one verdict line. */
export function RestaurantRow({ restaurant: r, sort = 'cheapest' }: Props) {
  const best = bestOffer(r);
  const fastest = fastestOffer(r);
  if (!best || !fastest) return null;
  const byTime = sort === 'fastest';

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/store/${r.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Photo source={restaurantPhoto(r)} fallback={r.image} style={styles.photo} />

      <View style={styles.body}>
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
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
    overflow: 'hidden',
  },
  rowPressed: { backgroundColor: '#fcfbf9' },
  // Photo first, flush to the card's rounded top corners.
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderTopLeftRadius: R.card - 1,
    borderTopRightRadius: R.card - 1,
  },
  body: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.16, color: C.fg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 13, color: C.muted, flexShrink: 1 },
  fg: { color: C.fg },
  forLine: { marginTop: 8, fontSize: 12, color: C.muted },
  line: { marginTop: 3, fontSize: 13, color: C.muted },
  strong: { color: C.winInk, fontWeight: '700' },
});

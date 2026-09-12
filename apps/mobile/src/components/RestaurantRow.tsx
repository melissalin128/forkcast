import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePrefs } from '../hooks/usePrefs';
import {
  activeDeals,
  bestOffer,
  cheapestFeeOffer,
  etaRange,
  fastestOffer,
  money,
  orderSummary,
  platformName,
  ratingCount,
  savingsTail,
} from '../lib/analysis';
import { hawtPixScore, type Sort } from '../lib/filter';
import { restaurantPhoto } from '../lib/photos';
import { C, R, num } from '../theme';
import type { Restaurant } from '../types';
import { CompareStrip } from './CompareStrip';
import { HeartIcon, StarIcon } from './Icons';
import { Photo } from './Photo';

interface Props {
  restaurant: Restaurant;
  sort?: Sort;
}

export function RestaurantRow({ restaurant: r, sort = 'cheapest' }: Props) {
  const { prefs, toggleSaved } = usePrefs();
  const best = bestOffer(r);
  const fastest = fastestOffer(r);
  const lowFee = cheapestFeeOffer(r);
  if (!best || !fastest || !lowFee) return null;
  const byTime = sort === 'fastest';
  const byFee = sort === 'cheapestFee';
  const deals = activeDeals(r);
  const saved = prefs.savedRestaurantIds.includes(r.id);
  const forYou = hawtPixScore(r, prefs) > 0;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/store/${r.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View>
        <Photo source={restaurantPhoto(r)} fallback={r.image} style={styles.photo} />
        {deals.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {money(Math.max(...deals.map((d) => d.promoDiscount)))} off {platformName(deals[0].platformSlug)}
            </Text>
          </View>
        )}
        {forYou && (
          <View style={styles.you}>
            <Text style={styles.youText}>For you</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? `Unsave ${r.name}` : `Save ${r.name}`}
          onPress={() => toggleSaved(r.id)}
          style={[styles.savebtn, saved && styles.saveOn]}
          hitSlop={6}
        >
          <HeartIcon size={16} stroke={saved ? C.white : C.fg} filled={saved} />
        </Pressable>
      </View>

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
          ) : byFee ? (
            <>
              <Text style={styles.strong}>Lowest fee on {platformName(lowFee.platformSlug)}</Text> · {money(lowFee.deliveryFee)} delivery
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
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderTopLeftRadius: R.card - 1,
    borderTopRightRadius: R.card - 1,
  },
  badge: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: C.winBg,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: C.winInk },
  you: {
    position: 'absolute',
    right: 44,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: C.accentBg,
  },
  youText: { fontSize: 11, fontWeight: '700', color: C.accentInk },
  savebtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: C.line,
  },
  saveOn: { backgroundColor: C.accent, borderColor: C.accent },
  body: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.16, color: C.fg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 13, color: C.muted, flexShrink: 1 },
  fg: { color: C.fg },
  forLine: { marginTop: 8, fontSize: 12, color: C.muted },
  line: { marginTop: 3, fontSize: 13, color: C.muted },
  strong: { color: C.winInk, fontWeight: '700' },
});

import { StyleSheet, Text, View } from 'react-native';
import { PLATFORMS } from '../data/mock';
import { bestOffer, etaRange, fastestOffer, money, offerFor } from '../lib/analysis';
import { C, num } from '../theme';
import type { Restaurant } from '../types';

interface Props {
  restaurant: Restaurant;
  /** Which column gets the mint highlight. */
  highlight?: 'cheapest' | 'fastest';
}

/**
 * The product: three fixed columns (DoorDash, Uber Eats, Grubhub) with the
 * delivered total for the same order. The winning column is mint; "—" when
 * the platform does not list the place.
 */
export function CompareStrip({ restaurant: r, highlight = 'cheapest' }: Props) {
  const top = highlight === 'fastest' ? fastestOffer(r) : bestOffer(r);
  return (
    <View accessibilityLabel="Delivered total per app" style={styles.strip}>
      {PLATFORMS.map((p) => {
        const o = offerFor(r, p.slug);
        const isTop = !!o && !!top && o.platformSlug === top.platformSlug && r.offers.length > 1;
        return (
          <View key={p.slug} style={[styles.col, isTop && styles.colBest]}>
            <Text style={[styles.plat, isTop && styles.ink]} numberOfLines={1}>
              {p.name}
            </Text>
            {o ? (
              <>
                <Text style={[styles.price, num, isTop && styles.ink]}>{money(o.total)}</Text>
                <Text style={styles.eta} numberOfLines={1}>
                  {etaRange(o)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.price, styles.priceNone]}>—</Text>
                <Text style={styles.eta} numberOfLines={1}>
                  not listed
                </Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6, marginTop: 10 },
  col: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 7,
    borderRadius: 8,
    backgroundColor: C.page,
    borderWidth: 1,
    borderColor: C.line,
    minWidth: 0,
  },
  colBest: { backgroundColor: C.winBg, borderColor: C.win },
  plat: { fontSize: 11, fontWeight: '600', color: C.muted },
  ink: { color: C.winInk },
  price: { marginTop: 3, fontSize: 16, lineHeight: 19, color: C.fg },
  priceNone: { color: C.muted, fontWeight: '500' },
  eta: { fontSize: 11, color: C.muted, marginTop: 1 },
});

import { StyleSheet, Text, View } from 'react-native';
import { PLATFORM_BY_SLUG, PLATFORMS } from '../data/mock';
import { usePrefs } from '../hooks/usePrefs';
import { etaRange, fees, money } from '../lib/analysis';
import { C, num } from '../theme';
import type { Restaurant } from '../types';
import { Card, CountUpMoney } from './ui';

/**
 * The three-platform ledger for the representative order: App / Food / Fees /
 * Total per platform. Cheapest row is mint. Totals count up when shown.
 */
export function PlatformLedger({ restaurant: r }: { restaurant: Restaurant }) {
  const { prefs } = usePrefs();
  const offers = [...r.offers].sort((a, b) => a.total - b.total);
  const missing = PLATFORMS.filter((p) => !r.offers.some((o) => o.platformSlug === p.slug));
  const passes = prefs.subscriptions.map((s) => PLATFORM_BY_SLUG[s].subscriptionName);
  const passText =
    passes.length === 0
      ? 'No passes applied.'
      : passes.length === 1
        ? `Your ${passes[0]} is applied.`
        : `Your ${passes.slice(0, -1).join(', ')} and ${passes[passes.length - 1]} are applied.`;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>{r.orderLabel}</Text>
        <Text style={styles.meta}>
          to <Text style={num}>{prefs.zip}</Text> · tip {r.tipPct}% · Prices from today
        </Text>
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.rowHead]}>
          <Text style={[styles.headCell, styles.colApp]}>App</Text>
          <Text style={[styles.headCell, styles.colNum]}>Food</Text>
          <Text style={[styles.headCell, styles.colNum]}>Fees</Text>
          <Text style={[styles.headCell, styles.colTotal]}>Total</Text>
        </View>
        {offers.map((o) => {
          const p = PLATFORM_BY_SLUG[o.platformSlug];
          return (
            <View key={o.platformSlug} style={styles.row}>
              <View style={styles.colApp}>
                <Text style={styles.name}>
                  {p.name} <Text style={styles.eta}>{etaRange(o)}</Text>
                </Text>
                {o.promoDiscount > 0 && <Text style={[styles.note, styles.notePromo]}>includes {money(o.promoDiscount)} off</Text>}
                {o.subscriptionApplied && <Text style={styles.note}>with {p.subscriptionName}</Text>}
              </View>
              <Text style={[styles.cell, num, styles.colNum]}>{money(o.subtotal)}</Text>
              <Text style={[styles.cell, num, styles.colNum]}>{money(fees(o))}</Text>
              <CountUpMoney value={o.total} style={[styles.cell, styles.total, styles.colTotal]} />
            </View>
          );
        })}
        {missing.map((p) => (
          <View key={p.slug} style={styles.row}>
            <View style={styles.colApp}>
              <Text style={[styles.name, styles.mutedText]}>{p.name}</Text>
            </View>
            <Text style={[styles.cell, styles.mutedText, styles.missing]}>not listed near {prefs.zip}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.foot}>
        Fees include delivery, service, tax and a {r.tipPct}% tip. {passText}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15, color: C.fg },
  meta: { fontSize: 12, color: C.muted },
  table: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowHead: { paddingTop: 2, paddingBottom: 6 },
  headCell: { fontSize: 10, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  colApp: { flex: 2, minWidth: 0 },
  colNum: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 1.2, textAlign: 'right' },
  cell: { fontSize: 12, color: C.fg },
  total: { fontSize: 13 },
  name: { fontWeight: '600', fontSize: 12, color: C.fg },
  eta: { color: C.muted, fontWeight: '500' },
  note: { fontSize: 11, color: C.muted, marginTop: 1 },
  notePromo: { color: C.winInk, fontWeight: '600' },
  mutedText: { color: C.muted },
  missing: { flex: 3.2, textAlign: 'right' },
  foot: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 18 },
});

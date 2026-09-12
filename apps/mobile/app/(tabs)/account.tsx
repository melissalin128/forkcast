import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { Btn, Card } from '../../src/components/ui';
import { COVERED_ZIPS, PLATFORMS } from '../../src/data/mock';
import { usePrefs } from '../../src/hooks/usePrefs';
import { useToast } from '../../src/hooks/useToast';
import { zipLabel } from '../../src/lib/prefs';
import { C, GUTTER, R, num } from '../../src/theme';

const coverage = `${[...COVERED_ZIPS].slice(0, -1).join(', ')} and ${COVERED_ZIPS[COVERED_ZIPS.length - 1]}`;

/** Zip + pass toggles. Both feed every total in the app. */
export default function Account() {
  const { prefs, ready, setZip, setTipPct, toggleSubscription } = usePrefs();
  const toast = useToast();
  const [draft, setDraft] = useState(prefs.zip);
  const valid = /^\d{5}$/.test(draft);

  // Prefs load from storage after first render; pick up the stored zip once.
  useEffect(() => {
    if (ready) setDraft(prefs.zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const save = () => {
    if (!valid || draft === prefs.zip) return;
    setZip(draft);
    toast('Prices updated');
  };

  return (
    <View style={styles.page}>
      <TopBar title="Account" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.cardTitle}>Deliver to</Text>
          <View style={styles.zipform}>
            <TextInput
              value={draft}
              onChangeText={(v) => setDraft(v.replace(/\D/g, ''))}
              onSubmitEditing={save}
              keyboardType="number-pad"
              maxLength={5}
              accessibilityLabel="Zip code"
              style={[styles.input, num]}
            />
            <Btn label="Save" onPress={save} disabled={!valid || draft === prefs.zip} />
          </View>
          <Text style={styles.foot}>
            Currently <Text style={num}>{prefs.zip}</Text> · {zipLabel(prefs.zip)}. We cover Pittsburgh zips {coverage} right
            now.
          </Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Tip included in comparisons</Text>
          <View accessibilityRole="radiogroup" style={styles.tipOptions}>
            {[0, 0.1, 0.15, 0.2, 0.25].map((tip) => {
              const on = prefs.tipPct === tip;
              return (
                <Pressable
                  key={tip}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    setTipPct(tip);
                    toast(`Totals updated with ${Math.round(tip * 100)}% tip`);
                  }}
                  style={[styles.tipOption, on && styles.tipOptionActive]}
                >
                  <Text style={[styles.tipOptionText, on && styles.tipOptionTextActive]}>{Math.round(tip * 100)}%</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.foot}>Tip is shown separately in the fee math and can change which app wins.</Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Your passes</Text>
          <View style={styles.toggles}>
            {PLATFORMS.map((p, i) => {
              const on = prefs.subscriptions.includes(p.slug);
              return (
                <View key={p.slug} style={[styles.toggle, i === PLATFORMS.length - 1 && styles.toggleLast]}>
                  <View style={styles.toggleText}>
                    <Text style={styles.toggleName}>{p.subscriptionName}</Text>
                    <Text style={styles.togglePerks}>
                      {p.name} · {p.subscriptionPerks.join(', ')}
                    </Text>
                  </View>
                  <Switch
                    value={on}
                    accessibilityLabel={`${p.subscriptionName} ${on ? 'on' : 'off'}`}
                    onValueChange={() => {
                      toggleSubscription(p.slug);
                      toast(`Prices updated for ${p.subscriptionName}`);
                    }}
                    trackColor={{ false: C.switchOff, true: C.accent }}
                    thumbColor={C.white}
                    ios_backgroundColor={C.switchOff}
                  />
                </View>
              );
            })}
          </View>
          <Text style={styles.foot}>
            All off unless you turn one on. Every total in Forkcast then drops the delivery fee on that app.
          </Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.foot}>
            Forkcast compares the delivered total for the same order on DoorDash, Uber Eats and Grubhub and links you out
            to the cheapest one. We do not process payment.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  content: { paddingTop: 12, paddingHorizontal: GUTTER, paddingBottom: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.15, color: C.fg },
  zipform: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.ctl,
    backgroundColor: C.inset,
    fontSize: 15,
    color: C.fg,
    minWidth: 0,
  },
  foot: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 18 },
  tipOptions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  tipOption: { flex: 1, height: 36, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inset },
  tipOptionActive: { borderColor: C.accent, backgroundColor: C.accentBg },
  tipOptionText: { fontSize: 13, fontWeight: '700', color: C.muted },
  tipOptionTextActive: { color: C.accentInk },
  toggles: { marginTop: 4 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  toggleLast: { borderBottomWidth: 0 },
  toggleText: { gap: 2, flexShrink: 1 },
  toggleName: { fontWeight: '700', fontSize: 14, color: C.fg },
  togglePerks: { fontSize: 12, color: C.muted },
});

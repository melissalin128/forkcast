import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FILTERS, type Category, type FilterKey } from '../lib/filter';
import { C, GUTTER, R } from '../theme';
import { ClearIcon, SlidersIcon } from './Icons';

interface Props {
  category: Category;
  query: string;
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
  onClear: () => void;
}

const GROUP_LABEL: Record<string, string> = { price: 'Price', time: 'Delivery time', diet: 'Dietary' };
const GROUPS = Array.from(new Set(FILTERS.map((f) => f.group)));

/** Filter button only — chips live inside the sheet, not listed out on the phone. */
export function FilterBar({ active, onToggle }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.btn, active.length > 0 && styles.btnOn]}
      >
        <SlidersIcon size={14} stroke={active.length ? C.accentInk : C.fg} />
        <Text style={[styles.btnText, active.length > 0 && styles.btnTextOn]}>
          Filters{active.length > 0 ? ` · ${active.length}` : ''}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.veil} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.head}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}>
                <ClearIcon size={16} stroke={C.fg} />
              </Pressable>
              <Text style={styles.title}>Filters</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
              {GROUPS.map((group) => (
                <View key={group} style={styles.group}>
                  <Text style={styles.groupLabel}>{GROUP_LABEL[group]}</Text>
                  <View style={styles.chips}>
                    {FILTERS.filter((f) => f.group === group).map((f) => {
                      const on = active.includes(f.key);
                      return (
                        <Pressable
                          key={f.key}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => onToggle(f.key)}
                          style={[styles.chip, on && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextActive]}>{f.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  btnOn: { borderColor: C.accent, backgroundColor: C.accentBg },
  btnText: { fontSize: 13, fontWeight: '700', color: C.fg },
  btnTextOn: { color: C.accentInk },
  veil: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  head: { height: 56, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: C.line },
  close: { position: 'absolute', left: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: C.fg },
  body: { padding: GUTTER, gap: 16 },
  group: { gap: 8 },
  groupLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    justifyContent: 'center',
  },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentBg },
  chipText: { fontSize: 13, fontWeight: '600', color: C.fg },
  chipTextActive: { color: C.accentInk },
});

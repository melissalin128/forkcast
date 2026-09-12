import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FILTERS, queryLabel, type Category, type FilterKey } from '../lib/filter';
import { C, GUTTER, R } from '../theme';

interface Props {
  category: Category;
  query: string;
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
  onClear: () => void;
}

export function FilterBar({ category, query, active, onToggle, onClear }: Props) {
  const label = queryLabel(category, active, query);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Filters">
        {FILTERS.map((f) => {
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
      </ScrollView>
      {!!label && (
        <View style={styles.query}>
          <Text style={styles.queryText}>{label}</Text>
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text style={styles.queryClear}>Clear</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, paddingTop: 4, paddingHorizontal: GUTTER, paddingBottom: 6 },
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
  query: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingBottom: 8,
  },
  queryText: { fontSize: 12, fontWeight: '700', color: C.accentInk, flexShrink: 1 },
  queryClear: { fontSize: 12, fontWeight: '700', color: C.muted },
});

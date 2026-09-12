import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '../lib/filter';
import { C, GUTTER } from '../theme';
import { CATEGORY_ICONS } from './Icons';

interface Props {
  value: string;
  onChange: (cat: string) => void;
}

/** Eight round-icon categories in a horizontal strip, delivery-app style. */
export function CategoryStrip({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
      {CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const active = value === cat;
        return (
          <Pressable
            key={cat}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(cat)}
            style={styles.cat}
          >
            <View style={[styles.circle, active && styles.circleActive]}>
              <Icon size={22} strokeWidth={1.8} stroke={active ? C.accentInk : C.fg} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {cat}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cats: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: GUTTER, paddingBottom: 6 },
  cat: { width: 60, alignItems: 'center', gap: 6 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: { backgroundColor: C.accentBg, borderWidth: 2, borderColor: C.accent },
  label: { fontSize: 11, fontWeight: '600', color: C.muted },
  labelActive: { color: C.fg },
});

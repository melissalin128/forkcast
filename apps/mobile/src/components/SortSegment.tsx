import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, R } from '../theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}

/** Segmented pill control (Cheapest / Fastest / Top rated). */
export function SortSegment<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.seg}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.btn, on && styles.btnActive]}
          >
            <Text style={[styles.text, on && styles.textActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 3, backgroundColor: C.inset, borderRadius: R.pill },
  btn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.pill },
  btnActive: {
    backgroundColor: C.card,
    shadowColor: C.fg,
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: { fontSize: 12, fontWeight: '600', color: C.muted },
  textActive: { color: C.fg },
});

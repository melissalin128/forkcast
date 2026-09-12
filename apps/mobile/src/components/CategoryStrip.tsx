import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, type Category } from '../lib/filter';
import { C, GUTTER, R } from '../theme';
import { ClearIcon, MenuIcon } from './Icons';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

/** Hamburger that opens the 18 cuisines. The phone cannot fit a persistent rail. */
export function CategoryStrip({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Categories, ${value} selected`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={styles.btn}
      >
        <MenuIcon size={18} stroke={C.fg} />
        <Text style={styles.btnText}>{value}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.veil} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.head}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}>
                <ClearIcon size={16} stroke={C.fg} />
              </Pressable>
              <Text style={styles.title}>Categories</Text>
            </View>
            <ScrollView accessibilityLabel="Category">
              {CATEGORIES.map((cat) => {
                const active = value === cat;
                return (
                  <Pressable
                    key={cat}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(cat);
                      setOpen(false);
                    }}
                    style={[styles.row, active && styles.rowOn]}
                  >
                    <Text style={[styles.label, active && styles.labelOn]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  btnText: { fontSize: 13, fontWeight: '700', color: C.fg },
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
  row: { paddingVertical: 12, paddingHorizontal: GUTTER },
  rowOn: { backgroundColor: C.inset },
  label: { fontSize: 15, fontWeight: '600', color: C.muted },
  labelOn: { color: C.fg, fontWeight: '800' },
});

import type { ReactElement } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Sort } from '../lib/filter';
import { C, GUTTER, R } from '../theme';
import type { Restaurant } from '../types';
import { RestaurantRow } from './RestaurantRow';
import { Btn } from './ui';

interface Props {
  restaurants: Restaurant[];
  loading: boolean;
  sort?: Sort;
  emptyText: string;
  action?: { label: string; onClick: () => void };
  /** Rendered above the first card and scrolls with the list. */
  header?: ReactElement;
}

const SKELETON = [0, 1, 2];

/** Vertical list of RestaurantRows with loading skeletons and an empty state. */
export function Feed({ restaurants, loading, sort, emptyText, action, header }: Props) {
  if (loading) {
    return (
      <FlatList
        data={SKELETON}
        keyExtractor={(i) => String(i)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.feed}
        accessibilityLabel="Loading prices"
        renderItem={() => (
          <View style={styles.skRow}>
            <View style={styles.skHead}>
              <View style={[styles.sk, styles.skThumb]} />
              <View style={{ flex: 1 }}>
                <View style={[styles.sk, styles.skTitle]} />
                <View style={[styles.sk, styles.skMeta]} />
              </View>
            </View>
            <View style={styles.skStrip}>
              <View style={[styles.sk, styles.skCol]} />
              <View style={[styles.sk, styles.skCol]} />
              <View style={[styles.sk, styles.skCol]} />
            </View>
          </View>
        )}
      />
    );
  }

  return (
    <FlatList
      data={restaurants}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.feed}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyText}</Text>
          {action && <Btn label={action.label} onPress={action.onClick} />}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.item}>
          <RestaurantRow restaurant={item} sort={sort} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  feed: { paddingBottom: 16, gap: 12 },
  skRow: {
    marginHorizontal: GUTTER,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
    padding: 12,
  },
  skHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sk: { backgroundColor: C.inset, borderRadius: 6 },
  skThumb: { width: 56, height: 56, borderRadius: 10 },
  skTitle: { height: 16, width: '55%' },
  skMeta: { height: 12, width: '40%', marginTop: 8 },
  skStrip: { flexDirection: 'row', gap: 6, marginTop: 10 },
  skCol: { flex: 1, height: 52, borderRadius: 8 },
  empty: { paddingVertical: 40, paddingHorizontal: 16, alignItems: 'center', gap: 14 },
  emptyText: { color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  item: { marginHorizontal: GUTTER },
});

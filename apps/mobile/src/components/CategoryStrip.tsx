import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CATEGORIES, type Category } from '../lib/filter';
import { C, GUTTER } from '../theme';

interface Props {
  value: string;
  onChange: (cat: Category) => void;
}

/** Illustrated tile per category: a large emoji on a soft tint, the way delivery apps draw their category row. */
const ART: Record<Category, { emoji: string; tint: string }> = {
  All: { emoji: '🍽️', tint: '#ebe6de' },
  Pizza: { emoji: '🍕', tint: '#fde8d8' },
  Burgers: { emoji: '🍔', tint: '#fdf0d5' },
  Chinese: { emoji: '🥡', tint: '#fbe1e1' },
  Mexican: { emoji: '🌮', tint: '#fff0d6' },
  Sushi: { emoji: '🍣', tint: '#ffe3e3' },
  Indian: { emoji: '🍛', tint: '#fbe9d0' },
  Thai: { emoji: '🍜', tint: '#e6f3e4' },
  Italian: { emoji: '🍝', tint: '#fbe3dc' },
  Chicken: { emoji: '🍗', tint: '#fdeedb' },
  Sandwiches: { emoji: '🥪', tint: '#f6ecd9' },
  Breakfast: { emoji: '🥞', tint: '#fff3d1' },
  Healthy: { emoji: '🥗', tint: '#e3f5e8' },
  Desserts: { emoji: '🍰', tint: '#fce4ef' },
  Coffee: { emoji: '☕', tint: '#efe4d8' },
  Vegan: { emoji: '🥑', tint: '#e8f4dd' },
  Halal: { emoji: '🥙', tint: '#e4f0e6' },
  Grocery: { emoji: '🛒', tint: '#e6f0fb' },
};

const CIRCLE = 56;
const RING = 2;
const RING_GAP = 2;
/** Circle + the gap + the ring: the tile keeps this size whether or not it is active. */
const TILE = CIRCLE + 2 * (RING + RING_GAP);
const FADE_W = 32;

/** Round category tiles in a horizontal strip; the active one gets the accent ring. */
export function CategoryStrip({ value, onChange }: Props) {
  const stripRef = useRef<ScrollView>(null);
  const tiles = useRef<Partial<Record<string, { x: number; w: number }>>>({});
  const scrollX = useRef(0);
  const stripW = useRef(0);

  // A selected tile can sit off-screen (a category picked elsewhere): bring it into view.
  const reveal = useCallback((cat: string) => {
    const tile = tiles.current[cat];
    if (!tile || !stripW.current) return;
    const pad = GUTTER;
    const left = tile.x - pad;
    const right = tile.x + tile.w + pad;
    let target: number | null = null;
    if (left < scrollX.current) target = left;
    else if (right > scrollX.current + stripW.current) target = right - stripW.current;
    if (target !== null) stripRef.current?.scrollTo({ x: Math.max(0, target), animated: true });
  }, []);

  useEffect(() => {
    reveal(value);
  }, [value, reveal]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cats}
        accessibilityLabel="Category"
        onLayout={(e) => {
          stripW.current = e.nativeEvent.layout.width;
        }}
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
      >
        {CATEGORIES.map((cat) => {
          const active = value === cat;
          const art = ART[cat];
          return (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(cat)}
              onLayout={(e: LayoutChangeEvent) => {
                tiles.current[cat] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
                if (active) reveal(cat);
              }}
              style={styles.cat}
            >
              <View style={[styles.ring, active && styles.ringActive]}>
                <View style={[styles.circle, { backgroundColor: art.tint }]}>
                  <Text style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
                    {art.emoji}
                  </Text>
                </View>
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Soft fade on the right so the row reads as scrollable. */}
      <View pointerEvents="none" style={styles.fade}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="cats-fade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={C.page} stopOpacity={0} />
              <Stop offset="1" stopColor={C.page} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#cats-fade)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  cats: { flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: GUTTER, paddingBottom: 6 },
  cat: { width: TILE, alignItems: 'center', gap: 6 - RING - RING_GAP },
  // The ring sits in a transparent border until the tile is active, so nothing shifts.
  ring: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    borderWidth: RING,
    borderColor: 'transparent',
    padding: RING_GAP,
  },
  ringActive: { borderColor: C.accent },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    ...Platform.select({
      web: { fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" },
      default: {},
    }),
  },
  label: { fontSize: 11, fontWeight: '600', color: C.muted },
  labelActive: { color: C.fg },
  fade: { position: 'absolute', top: 0, right: 0, bottom: 0, width: FADE_W },
});

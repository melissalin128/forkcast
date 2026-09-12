import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { money } from '../lib/analysis';
import { C, GUTTER, R, num } from '../theme';

/** `linear-gradient(135deg, #a, #b)` from mock.ts drawn with SVG, top-left to bottom-right. */
export function Gradient({ css, radius = 0 }: { css: string; radius?: number }) {
  const stops = css.match(/#[0-9a-f]{3,8}/gi) ?? [C.inset, C.inset];
  const from = stops[0] ?? C.inset;
  const to = stops[1] ?? from;
  const id = `g-${from.slice(1)}-${to.slice(1)}`;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface BtnProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Accent button (`.btn.btn--accent`). */
export function Btn({ label, onPress, disabled, style }: BtnProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, disabled && styles.btnDisabled, pressed && !disabled && styles.pressed, style]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

/** Centered muted paragraph (`.notice`). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * The one animation from the web app: a price that counts up from $0.00 over
 * 500 ms when it first appears (Prices tab). Re-runs when `value` changes.
 */
export function CountUpMoney({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const t = (Date.now() - start) / 500;
      setShown(value * easeOutExpo(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <Text style={[num, style]}>{money(shown)}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.card,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  btn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: R.ctl,
    backgroundColor: C.accent,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  btnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  notice: { paddingVertical: 40, paddingHorizontal: GUTTER, alignItems: 'center' },
  noticeText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

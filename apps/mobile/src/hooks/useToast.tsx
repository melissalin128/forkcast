import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, TABBAR_H } from '../theme';

const Ctx = createContext<((text: string) => void) | null>(null);

const SHOW_MS = 2000;

/** One small status line at the bottom of the screen, gone after 2 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fade = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (next: string) => {
      clearTimeout(timer.current);
      setText(next);
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => setText(null), SHOW_MS);
    },
    [fade],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <View pointerEvents="none" style={[styles.wrap, { bottom: TABBAR_H + insets.bottom + 12 }]}>
        {text && (
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
            ]}
          >
            <Text style={styles.text}>{text}</Text>
          </Animated.View>
        )}
      </View>
    </Ctx.Provider>
  );
}

export function useToast(): (text: string) => void {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  toast: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    backgroundColor: C.fg,
    shadowColor: C.fg,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  text: { color: C.white, fontSize: 13, fontWeight: '600' },
});

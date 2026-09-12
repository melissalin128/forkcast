import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrefs } from '../hooks/usePrefs';
import { zipLabel } from '../lib/prefs';
import { C, GUTTER, R, TOP_H, num } from '../theme';
import { ChevronDown, ChevronLeft, ClearIcon, ForkIcon, PinIcon, SearchIcon } from './Icons';

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
}

interface Props {
  /** Deliver-to row + 48px search field (Home). */
  search?: SearchProps;
  /** Back chevron + title instead of the deliver row (Store). */
  back?: { title: string };
  /** Plain title row (Savings, Account). */
  title?: string;
}

/** Header pinned above the scrolling content; mirrors `.top` in the web app. */
export function TopBar({ search, back, title }: Props) {
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.top, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [styles.back, pressed && { backgroundColor: C.inset }]}
          >
            <ChevronLeft />
          </Pressable>
        ) : title ? null : (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Deliver to ${prefs.zip}, change in Account`}
            onPress={() => router.navigate('/account')}
            style={styles.deliver}
          >
            <PinIcon stroke={C.accent} />
            <Text style={styles.deliverLabel}>Deliver to</Text>
            <Text style={styles.deliverWhere} numberOfLines={1}>
              <Text style={num}>{prefs.zip}</Text> · {zipLabel(prefs.zip)}
            </Text>
            <ChevronDown stroke={C.muted} />
          </Pressable>
        )}
        {back && (
          <Text style={styles.title} numberOfLines={1}>
            {back.title}
          </Text>
        )}
        {title && !back && (
          <Text style={[styles.title, styles.titlePage]} numberOfLines={1}>
            {title}
          </Text>
        )}
        <View style={styles.grow} />
        <Pressable accessibilityRole="link" accessibilityLabel="Forkcast home" onPress={() => router.navigate('/')} style={styles.brand}>
          <ForkIcon size={18} stroke={C.accent} />
          <Text style={styles.brandText}>Forkcast</Text>
        </Pressable>
      </View>

      {search && (
        <View style={styles.searchbar}>
          <SearchIcon stroke={C.muted} />
          <TextInput
            value={search.value}
            onChangeText={search.onChange}
            placeholder="Search restaurants or dishes"
            placeholderTextColor={C.muted}
            accessibilityLabel="Search restaurants or dishes"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            style={styles.input}
          />
          {search.value !== '' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => search.onChange('')}>
              <ClearIcon stroke={C.muted} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    zIndex: 20,
  },
  row: {
    height: TOP_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: GUTTER,
  },
  deliver: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  deliverLabel: { color: C.muted, fontWeight: '500', fontSize: 14 },
  deliverWhere: { fontWeight: '600', fontSize: 14, color: C.fg, flexShrink: 1 },
  back: {
    width: 32,
    height: 32,
    marginLeft: -6,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '700', fontSize: 15, color: C.fg, flexShrink: 1 },
  titlePage: { fontSize: 17 },
  grow: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandText: { fontWeight: '700', fontSize: 15, letterSpacing: -0.15, color: C.fg },
  searchbar: {
    marginHorizontal: GUTTER,
    marginBottom: 10,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: C.inset,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: R.card,
  },
  input: { flex: 1, height: '100%', fontSize: 15, fontWeight: '500', color: C.fg, paddingVertical: 0 },
});

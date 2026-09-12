import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrefsProvider } from '../src/hooks/usePrefs';
import { ToastProvider } from '../src/hooks/useToast';
import { C } from '../src/theme';

/** Root: prefs + toast providers, then a stack of the tab group and the store page. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.page } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="store/[id]" />
          </Stack>
        </ToastProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

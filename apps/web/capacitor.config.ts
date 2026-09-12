import type { CapacitorConfig } from '@capacitor/cli';

// Native wrapper for the App Store / Play Store builds. The web build in
// `dist/` is the app; Capacitor packages it into an iOS or Android shell.
// See MOBILE.md for the one-time setup.
const config: CapacitorConfig = {
  appId: 'com.forkcast.app',
  appName: 'Forkcast',
  webDir: 'dist',
  server: {
    // Native builds talk to the API over https; set this to your deployed API
    // origin. While developing on a phone on the same Wi-Fi you can instead
    // point it at your laptop, e.g. http://192.168.1.20:5173 with cleartext on.
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;

# Forkcast mobile (Expo / React Native)

The phone app. Same screens, copy and data as `apps/web`, written in React
Native so it runs in **Expo Go** without Xcode or Android Studio.

- Home · Savings · Account bottom tabs, a store page with Menu | Prices tabs
- The compare strip (DoorDash / Uber Eats / Grubhub delivered totals), the
  fee ledger, and the 7-day price chart drawn with `react-native-svg`
- Zip and passes (DashPass, Uber One, Grubhub+) persist in AsyncStorage and
  re-derive every total exactly like the web app
- Tries the API first and falls back to the bundled sample prices after 2.5 s

## Run it on your phone

1. Install **Expo Go** from the App Store or Play Store.
2. On the laptop:

   ```bash
   cd apps/mobile
   npm install
   npx expo start
   ```

3. Scan the QR code in the terminal — with the Camera app on iPhone, or from
   inside Expo Go on Android. The phone and the laptop must be on the same
   Wi-Fi. If the QR code will not connect (some campus networks block LAN
   traffic), run `npx expo start --tunnel` instead.

The app works with no API running: it shows the sample prices and a thin
"Showing sample prices" bar on Home.

## Live prices from the API

`apps/api` listens on `http://localhost:4000`, but on a phone `localhost` is
the phone itself. Point the app at the laptop's LAN IP instead:

```bash
cd apps/api && npm run dev                  # in one terminal

cd apps/mobile
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 npx expo start   # your laptop's IP
```

Find the IP with `ipconfig getifaddr en0` (macOS), `hostname -I` (Linux) or
`ipconfig` (Windows). You can also put the line in `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

`EXPO_PUBLIC_*` variables are inlined at bundle time, so restart
`npx expo start` (with `-c` to clear the cache) after changing it.

## Checks (no device needed)

```bash
npx tsc --noEmit                  # types
npx expo export --platform web    # bundles the router + every screen
```

## Layout

```
app/                     expo-router routes
  _layout.tsx            providers + root stack
  (tabs)/_layout.tsx     Home · Savings · Account tab bar
  (tabs)/index.tsx       Home
  (tabs)/savings.tsx
  (tabs)/account.tsx
  store/[id].tsx         store page (?tab=prices opens the Prices tab)
src/
  types.ts, data/mock.ts, lib/{analysis,filter,prefs}.ts   copied from apps/web
  api/client.ts          fetch-then-fallback client (EXPO_PUBLIC_API_URL)
  hooks/                 usePrefs (AsyncStorage), useData, useToast
  components/            TopBar, CategoryStrip, CompareStrip, RestaurantRow,
                         Feed, SortSegment, PlatformLedger, PriceHistory, Icons, ui
  theme.ts               the web app's color tokens
```

The app uses the system font. Manrope (the web face) can be added later with
`expo-font` + `@expo-google-fonts/manrope`; nothing depends on it.

## Building a real binary later (EAS)

Expo Go is for development. For a TestFlight / Play Store build:

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build:configure            # writes eas.json
eas build --platform ios       # or android, or all
eas submit --platform ios      # after the build finishes
```

`app.json` already carries the bundle identifier (`app.forkcast.mobile`),
scheme (`forkcast://`) and icons. For a local build instead of EAS's cloud
runners, `npx expo run:ios` / `npx expo run:android` (needs Xcode / Android
Studio) generates the native projects; keep `ios/` and `android/` out of git
(the `.gitignore` already does).

# Forkcast native wrapper (Capacitor shell for iOS / Android)

This folder wraps the `apps/web` build in a native shell for App Store or
Play Store builds. The React Native app in `apps/mobile` is the primary
mobile app and is easier to run on a phone; keep this folder only if you
want a store build of the web bundle.

There are two ways to run Forkcast as a mobile app from the web build.

## 1. Install it from the browser (no app store, works today)

The web app is a Progressive Web App. On a phone:

- **iPhone (Safari):** open the app URL, tap Share, then "Add to Home Screen".
- **Android (Chrome):** open the app URL, accept the "Install app" prompt, or use the menu and "Add to Home screen".

It opens full screen with its own icon, remembers your zip and passes, and
loads instantly. Prices are always fetched live; only the app shell is cached.

For a demo on your own phone while the API runs on your laptop:

```bash
cd apps/api && npm run dev              # API on http://<laptop-ip>:4000
cd apps/web && npx vite --host          # web on http://<laptop-ip>:5173
```

Open `http://<laptop-ip>:5173` on the phone (same Wi-Fi) and add it to the
home screen. The Vite dev server proxies `/api` to the laptop API.

## 2. Native iOS / Android build (Capacitor)

`capacitor.config.ts` is already in place. One-time setup on a Mac with Xcode
(iOS) or Android Studio (Android):

```bash
cd apps/web
npm run build
npx cap add ios        # creates ios/  (needs Xcode + CocoaPods)
npx cap add android    # creates android/  (needs Android Studio)
```

Then, after every web change:

```bash
npm run build && npx cap sync
npx cap open ios       # or: npx cap open android
```

Run it on a simulator or a device from Xcode / Android Studio. Point
`server.url` in `capacitor.config.ts` at the deployed API origin for a real
build; the web bundle itself is served from inside the app.

## What is and is not different on mobile

- The layout is designed at 390px first; the bottom tab bar (Home, Search,
  Prices, Account) only appears at phone width.
- The price scrapers run on the API, never on the phone. The phone only ever
  talks to `/api/*`.
- No push notifications yet; "Alert me under $X" is designed but not built.

# Broomstick League — Manager

A single-file Quidditch club management sim: squads, tactics, transfers, a
newspaper that reports on your season, press conferences, disciplinary
hearings, and twenty weeks a season to prove something. Runs entirely
client-side — no backend, no build step for the web version.

```
broomstick-league/
├─ web/                the game itself — deploy this folder as-is
│  ├─ index.html        markup + CSS + all game logic
│  ├─ manifest.json      PWA manifest (installable, themed, icons)
│  ├─ sw.js              service worker (offline play, network-first updates)
│  └─ icons/             app icons (192/512, used by the manifest and Android)
└─ android-app/         Capacitor wrapper that packages web/ as an Android APK
   ├─ capacitor.config.json
   ├─ package.json
   └─ android/           native Gradle project (generated, builds the APK)
```

## Play it in a browser

The game is a static site — three files, no server-side code. Any static
host works (GitHub Pages, Netlify, Vercel, S3, etc.): point it at `web/` and
serve `index.html`.

To run it locally:

```bash
cd broomstick-league/web
npx http-server -p 8080 -c-1
# open http://localhost:8080/index.html
```

It registers a service worker on load, so after the first visit it keeps
working offline and can be "installed" (Add to Home Screen / the browser's
install prompt) as a standalone app on desktop, Android or iOS.

## Build the Android APK

The `android-app/` folder wraps `web/` with [Capacitor](https://capacitorjs.com/),
which loads the same HTML/CSS/JS inside a native WebView shell — there is no
second copy of the game to maintain; `web/` stays the single source of truth
and gets synced in at build time.

**Fastest path — GitHub Actions:** push to `main` (or run the workflow
manually) and `.github/workflows/android-build.yml` builds a debug APK on
GitHub's runners and uploads it as a build artifact you can download and
install directly (enable "install unknown apps" for your browser/file
manager when you open it, since it isn't signed for the Play Store).

**Locally**, with Android Studio (or just the Android SDK + a JDK 17+)
installed:

```bash
cd broomstick-league/android-app
npm install
npx cap sync android      # copies web/ into the native project
cd android
./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

Or open `broomstick-league/android-app/android` directly in Android Studio
and hit Run.

### Publishing a signed release build

The workflow only produces a debug build. To ship a real release, generate a
signing key and build `assembleRelease` (or `bundleRelease` for an .aab),
following Android's
[app signing guide](https://developer.android.com/studio/publish/app-signing).
Do not commit the keystore or its passwords — store them as GitHub Actions
secrets and reference them from `android/app/build.gradle` if you wire up a
release job.

## What changed making it web + Android ready

- Renamed the page to `index.html` and updated the manifest/service worker
  to match (previously self-referenced by its original filename).
- The service worker now serves navigations network-first (so an online
  player always gets the latest build) and falls back to the cache offline;
  static assets stay cache-first.
- Added real PNG app icons (192/512, `any` + `maskable`) — the original
  manifest only had an inline SVG data URI, which most Android install/TWA
  tooling won't accept.
- Added safe-area-aware CSS (`env(safe-area-inset-*)`) for notches and the
  gesture bar, `touch-action: manipulation` and disabled tap highlighting on
  buttons, and turned off overscroll bounce — all invisible in a desktop
  browser but rough on a phone without them.
- Added the Capacitor Android project, with launcher icons generated from
  the same snitch mark at every density, and a hardware back-button handler
  (double-press to exit; ignored while a modal with real consequences is on
  screen, since a stray back-press shouldn't answer a press-conference
  question or agree to a contract for you).
- Added a CI workflow that builds an installable debug APK on every push,
  since this sandbox has no route to `dl.google.com` to fetch the Android
  SDK itself.

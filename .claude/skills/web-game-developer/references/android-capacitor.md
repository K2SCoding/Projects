# Android via Capacitor

The goal: ship the exact same `web/` build as a native Android app, with
zero forked game logic. [Capacitor](https://capacitorjs.com/) wraps a web
build in a native WebView shell and exposes a handful of native APIs
(back button, exit, etc.) to the page as plain JS globals — no bundler or
build step required on the web side.

## Project layout

Keep the web game and the native wrapper as siblings, not nested — the
wrapper's `webDir` just points at the existing web folder, so there's one
source of truth:

```
my-game/
├─ web/                 the game — deploy this folder as-is for the browser
│  ├─ index.html
│  ├─ manifest.json
│  ├─ sw.js
│  └─ icons/
└─ android-app/         Capacitor wrapper — packages web/ as an APK
   ├─ capacitor.config.json
   ├─ package.json
   └─ android/           generated native Gradle project
```

## Setup

```bash
cd android-app
npm init -y
npm install --save-exact @capacitor/core @capacitor/android
npm install --save-exact --save-dev @capacitor/cli
```

`capacitor.config.json`:

```json
{
  "appId": "com.yourname.yourgame",
  "appName": "Your Game",
  "webDir": "../web",
  "backgroundColor": "#0F1620",
  "android": { "backgroundColor": "#0F1620" },
  "server": { "androidScheme": "https" }
}
```

```bash
npx cap add android   # scaffolds android/ — no Android SDK needed for this step
```

`npx cap sync android` re-copies `web/` into the native project and updates
native plugin registrations; run it after every web change and before every
native build. It's safe and idempotent.

## App icons (every density, generated once)

Android needs the launcher icon baked at multiple pixel sizes per density
bucket, plus a separate "adaptive icon" foreground layer (transparent,
content only) over a solid background color for API 26+. Generate both
from one source SVG rather than hand-drawing five sizes:

- **Legacy/round icons** (`ic_launcher.png`, `ic_launcher_round.png`) — the
  full icon *with* background, square canvas, sizes 48/72/96/144/192px for
  mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi → `android/app/src/main/res/mipmap-*dpi/`.
- **Adaptive icon foreground** (`ic_launcher_foreground.png`) — content
  only, transparent background, scaled down (~60% of canvas) so it survives
  circular/squircle masking, sizes 108/162/216/324/432px at the same
  density buckets.
- **Background color** — set in
  `android/app/src/main/res/values/ic_launcher_background.xml`
  (`<color name="ic_launcher_background">#0F1620</color>`), referenced by
  `mipmap-anydpi-v26/ic_launcher.xml`.

A headless browser can rasterize an SVG to PNG at any size without any
image-editing dependency (Playwright/Puppeteer, or any headless Chromium):
render the SVG in a page sized to the target pixel dimensions and screenshot
it. Do this once per release of the icon artwork, not as part of every
build.

## Hardware back button

Capacitor's `@capacitor/app` plugin exposes `backButton` as a plain event
on `window.Capacitor.Plugins.App` — no import/bundler needed, it's injected
by the native runtime. Guard two things: don't let a stray back-press exit
the app instantly, and don't let it dismiss a modal that has real
consequences (the player didn't choose an option, so nothing should be
chosen for them).

```js
if (window.Capacitor?.isNativePlatform?.()) {
  let lastBack = 0;
  window.Capacitor.Plugins.App.addListener('backButton', () => {
    if (isModalOpen()) return; // modal choices need a deliberate tap
    const now = Date.now();
    if (now - lastBack < 2000) window.Capacitor.Plugins.App.exitApp();
    else { lastBack = now; showHint('press back again to exit'); }
  });
}
```

`window.Capacitor` is `undefined` in a plain browser tab, so this code is a
no-op there — no feature-detection boilerplate needed beyond the one check.

## `.gitignore` for the wrapper

Don't commit generated/native-build output — regenerate it from the web
source at build time:

```
node_modules/
android/local.properties
android/.gradle/
android/build/
android/app/build/
android/capacitor-cordova-android-plugins/
android/app/src/main/assets/public/
android/app/src/main/assets/capacitor.config.json
*.apk
*.aab
```

## Building the APK

**Locally**, with Android Studio or just an Android SDK + JDK 17+:

```bash
npx cap sync android
cd android
./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

**In CI (GitHub Actions)** is usually easier than sourcing an Android SDK
into a sandboxed/offline dev environment, since GitHub's runners already
have one and full network access to Google's servers:

```yaml
name: Android build
on:
  push: { branches: [main] }
  pull_request: {}
  workflow_dispatch: {}

jobs:
  apk:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: android-app
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "21" }

      # ubuntu-latest already has an Android SDK with ANDROID_HOME set.
      # Just accept the licenses and let Gradle auto-download whatever
      # compileSdk/build-tools it actually needs during the build — don't
      # add a third-party "setup Android SDK" action on top of this. See
      # the pitfall below for why.
      - name: Accept Android SDK licenses
        run: |
          SDKMANAGER="$(command -v sdkmanager || find "$ANDROID_HOME" "$ANDROID_SDK_ROOT" -type f -name sdkmanager 2>/dev/null | sort -r | head -n1)"
          yes | "$SDKMANAGER" --licenses > /dev/null || true

      - uses: actions/setup-node@v4
        with: { node-version: "22" }

      - run: npm install
      - run: npx cap sync android
      - run: chmod +x android/gradlew
      - run: echo "sdk.dir=${ANDROID_HOME:-$ANDROID_SDK_ROOT}" > android/local.properties
      - run: cd android && ./gradlew assembleDebug --no-daemon

      - uses: actions/upload-artifact@v4
        with:
          name: debug-apk
          path: android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

A debug build is signed with the auto-generated debug key — installable
directly on a device (with "install unknown apps" allowed) but not
distributable on the Play Store. A real release needs a generated signing
key and `assembleRelease`/`bundleRelease`, with the keystore and its
passwords stored as CI secrets, never committed.

### Pitfall: `android-actions/setup-android@v3` can fail outright

This popular action tries to install the legacy Android SDK `tools`
package as part of its own setup. Google removed that package from the SDK
repository, so `sdkmanager tools` now fails with "Failed to find package
'tools'" and the whole step errors out — before your build even starts,
independent of anything in your project. Since GitHub's `ubuntu-latest`
runners already ship a working Android SDK with `ANDROID_HOME` exported,
the simplest fix is to skip that action entirely: just accept the SDK
licenses directly (as in the workflow above) and let the Android Gradle
plugin auto-download the specific platform/build-tools versions your
`compileSdk` needs. If a CI Android build fails in the first ~30 seconds
with no Gradle output at all, suspect the SDK-setup step, not your app.

### Pitfall: sandboxed dev environments usually can't reach the Android SDK

If you're developing inside a network-restricted sandbox (no route to
`dl.google.com`), you can still scaffold and configure the entire Capacitor
project, generate icons, write the CI workflow, and validate the web game
thoroughly — you just can't produce the final APK binary locally. Say so
explicitly rather than claiming a build succeeded; point at the CI
artifact as the actual deliverable.

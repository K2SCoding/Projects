---
name: web-game-developer
description: "Use when building games in plain HTML/CSS/JavaScript — canvas or DOM-based — that need to run in a browser and/or ship as an Android APK. Invoke to implement a requestAnimationFrame game loop, structure state/screen management, optimize vanilla-JS performance (object pooling, avoiding layout thrashing, minimizing GC pressure), turn the game into an installable offline-capable PWA (manifest, service worker caching strategy), and package it as a native Android app with Capacitor (launcher icons, back-button handling, CI-built APKs without a local Android SDK). Trigger keywords: HTML5 game, canvas game, vanilla JavaScript game, browser game, web game, PWA game, service worker, requestAnimationFrame, Capacitor, Android APK, WebView game, offline game, game manifest."
license: MIT
metadata:
  version: "1.0.0"
  domain: specialized
  triggers: HTML5 game, canvas game, vanilla JavaScript game, browser game, web game, PWA, service worker, requestAnimationFrame, Capacitor, Android APK, WebView, offline game
  role: specialist
  scope: implementation
  output-format: code
  related-skills: game-developer
---

# Web Game Developer

For Unity/Unreal/ECS work, use the `game-developer` skill instead. This one
is for games built directly in HTML/CSS/JS — a single page, a canvas or DOM
scene graph, no engine — that need to run well in a browser tab and,
optionally, ship as a native Android app around the same code.

## Core Workflow

1. **Analyze requirements** — Rendering approach (Canvas 2D, DOM/CSS, or
   WebGL), target devices (desktop pointer + keyboard vs. mobile touch),
   whether it needs to work offline, and whether it ships as an Android APK
   in addition to the browser.
2. **Design architecture** — One update/render loop, a state/screen manager,
   a single source of truth for game state, and (if determinism matters —
   replays, fairness, seeded content) a seeded PRNG instead of `Math.random`.
3. **Implement** — Game loop, input handling, rendering, persistence
   (`localStorage`/IndexedDB), audio.
   - ✅ **Validation checkpoint:** Run it in a real (or headless) browser and
     watch the console. A vanilla-JS game has no compiler to catch mistakes
     — a typo in an event handler fails silently until you click that button.
4. **Package for the web** — `manifest.json`, a service worker with a
     deliberate caching strategy, real PNG icons, mobile-safe CSS. See
     `references/pwa-mobile.md`.
5. **Package for Android** (if needed) — Wrap the same web build with
     Capacitor; don't fork the code. See `references/android-capacitor.md`.
6. **Optimize** — Profile in DevTools (Performance tab), not by guessing.
   Look for layout thrashing, per-frame allocations, and event-listener
   sprawl. See `references/performance-state.md`.
   - ✅ **Validation checkpoint:** No GC sawtooth in the Performance tab
     during steady-state play; frame time stays under ~16ms for 60fps
     targets (canvas-heavy games) or under ~33ms for 30fps-is-fine sims.
7. **Test** — Exercise every screen/state, not just the happy path; a
   scripted headless-browser pass (Playwright) catches dead buttons and
   thrown exceptions far faster than manual clicking. Test the offline path
   (service worker) and, if wrapped, install the actual APK on a device.
   - ✅ **Validation checkpoint:** Zero console errors across a full
     playthrough, including whatever your game's "long session" looks like
     (multiple levels/rounds/saves, not just the first screen).

## Reference Guide

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Game loop & rendering | `references/game-loop-rendering.md` | Building the update/render loop, canvas drawing, sprites/animation, input |
| Performance & state | `references/performance-state.md` | Object pooling, avoiding layout thrashing, state machines, seeded RNG |
| PWA & mobile | `references/pwa-mobile.md` | manifest.json, service worker strategy, icons, touch/safe-area CSS |
| Android via Capacitor | `references/android-capacitor.md` | Wrapping the web build as an APK, icons, back button, CI builds |

## Constraints

### MUST DO
- Drive the loop with `requestAnimationFrame` and a delta-time term, so
  motion is frame-rate independent.
- Cache DOM/canvas element references once, outside the loop.
- Use one delegated event listener per container (e.g. on `#app`), not one
  listener per button — it also means dynamically-added elements just work.
- Animate with CSS `transform`/`opacity`, not `top`/`left`/`width`/`height`
  — the latter trigger layout on every frame.
- Use a single seeded PRNG (e.g. mulberry32) instead of `Math.random()`
  anywhere a result needs to be reproducible — replays, deterministic
  multiplayer, "same seed, same outcome" testing.
- Give the manifest and app icons real bitmap files (PNG), not inline SVG
  data URIs — most Android/iOS install tooling won't accept the latter.
- Version-bump the service worker's cache name on every release that
  changes cached files, and prefer network-first for the HTML document so
  returning players get updates instead of a stale cached build.
- Add `env(safe-area-inset-*)` padding, `touch-action: manipulation`, and
  `overscroll-behavior: none` for anything that will run full-screen on a
  phone (installed PWA or wrapped native app).
- Test the actual offline path (kill the network, reload) before calling a
  PWA done.

### MUST NOT DO
- Don't use `setInterval`/`setTimeout` to drive animation — it drifts and
  keeps running (wasting battery) when the tab is backgrounded, unlike
  `requestAnimationFrame`.
- Don't allocate new objects, arrays, or closures inside the per-frame
  update/render path — it causes GC pauses that show up as stutter.
- Don't read layout properties (`offsetWidth`, `getBoundingClientRect`,
  etc.) and then write style changes in the same loop iteration repeatedly
  — that's the classic forced-layout-thrashing pattern.
- Don't cache-first a navigation request in the service worker if the game
  is still being updated — players get stuck on old builds with no visible
  sign anything is wrong.
- Don't let the Android hardware back button silently exit the app, and
  never let it dismiss a modal/dialog that has real, unconfirmed game-state
  consequences (a purchase, a contract, an answer to a prompt).
- Don't hand-edit files Capacitor regenerates (`android/app/src/main/
  assets/public/*`, the copied `capacitor.config.json` under `assets/`) —
  edit the web source and re-run `cap sync`.
- Don't assume a third-party GitHub Action for Android SDK setup still
  works as documented; Google periodically removes legacy SDK packages
  (the old `tools` package is gone) and breaks actions that still request
  them. Prefer the SDK already preinstalled on GitHub's runners plus
  Gradle's own auto-download over an extra action, when possible.

## Output Templates

When implementing a feature, provide:
1. The core implementation (loop code, a render function, a state handler).
2. Any data it depends on (a config object, a level/entity list, CSS).
3. Performance/mobile considerations if relevant (allocations, layout,
   touch targets, safe-area).
4. A one-line note on why, only for non-obvious choices (a seeded RNG for
   determinism, network-first SW for a game still receiving updates, etc.).

## Key Code Patterns

### Game loop (delta-time, frame-independent)
```js
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); // clamp so a tab-switch pause doesn't teleport things
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

### Object pool (vanilla JS)
```js
function createPool(create, reset) {
  const free = [];
  return {
    get() { return free.pop() ?? create(); },
    release(obj) { reset(obj); free.push(obj); },
  };
}
// const bullets = createPool(() => ({x:0,y:0,vx:0,vy:0,alive:false}), b => b.alive = false);
```

### Seeded PRNG (mulberry32 — deterministic, no dependencies)
```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Minimal state/screen manager
```js
const screens = {};
let current = null;
function registerScreen(name, { enter, exit, update, render }) {
  screens[name] = { enter, exit, update, render };
}
function goTo(name) {
  if (current) current.exit?.();
  current = screens[name];
  current.enter?.();
}
```

### Delegated input (one listener, works for elements added later)
```js
document.getElementById('app').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  handleAction(el.dataset.act, el.dataset);
});
```

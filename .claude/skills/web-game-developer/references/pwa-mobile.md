# PWA & Mobile

Turning a web game into an installable, offline-capable app — and making it
not feel like a website on a phone — is almost entirely three files plus a
handful of CSS rules.

## manifest.json

```json
{
  "name": "Full Game Name",
  "short_name": "ShortName",
  "description": "One sentence.",
  "start_url": "./index.html",
  "id": "./index.html",
  "display": "standalone",
  "scope": "./",
  "theme_color": "#0F1620",
  "background_color": "#0F1620",
  "orientation": "portrait-primary",
  "categories": ["games"],
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- Icons **must be real PNG files**, not inline SVG data URIs — browsers
  accept the latter for a basic install prompt, but Android's install
  tooling and any native wrapper (Capacitor, Trusted Web Activity) won't.
  Generate them once from a source SVG at 192 and 512px.
- `maskable` icons get cropped into circles/squircles/rounded-squares
  depending on the launcher, so keep the important content within the
  center ~80% of the canvas (roughly 10% margin on every side) — a
  full-bleed background with centered content, not edge-to-edge artwork.
- `orientation: "portrait-primary"` (or `landscape-primary`) locks the
  install/native shell to that orientation; omit it if the game genuinely
  supports both.

## Service worker: pick a strategy on purpose

A cache-first service worker for *everything* — including the HTML
document — is the most common PWA mistake in a game that's still being
updated: a returning player gets whatever was cached on their first visit,
forever, with no visible sign anything is stale.

**Network-first for navigations, cache-first for static assets** is the
right default for a game under active development:

```js
const CACHE = 'my-game-v2'; // bump this string on every release that changes cached files
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          if (resp?.status === 200) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((r) =>
      r || fetch(e.request).then((resp) => {
        if (resp?.status === 200) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
        return resp;
      })
    ).catch(() => caches.match('./index.html'))
  );
});
```

Only go fully cache-first (better for a truly offline-first game with rare
updates) if you also have a clear "there's an update, refresh to get it"
signal to the player — otherwise players silently stay on old code
indefinitely.

Register it defensively — a failed registration should never block the
game from working:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
```

## Mobile CSS that matters

```css
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
```

```css
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}
html { overscroll-behavior-y: none; } /* no rubber-band/pull-to-refresh eating swipe gestures */
body { overscroll-behavior-y: none; -webkit-text-size-adjust: 100%; }
* { -webkit-tap-highlight-color: transparent; } /* no gray flash on tap */
button { touch-action: manipulation; -webkit-user-select: none; user-select: none; }
#app {
  padding: calc(16px + var(--sat)) calc(14px + var(--sar))
           calc(16px + var(--sab)) calc(14px + var(--sal));
}
```

`viewport-fit=cover` without the matching `env(safe-area-inset-*)` padding
is worse than not using it at all — content draws under the notch/gesture
bar with nothing pushing it clear.

## Testing the offline path

Don't assume the service worker works because you wrote it correctly —
verify it: load the game once online (so it installs and caches), then in
DevTools → Network, switch to "Offline" and reload. If it doesn't load,
check the Application → Service Workers panel for registration errors and
the Cache Storage panel for what actually got cached.

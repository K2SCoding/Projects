# Game Loop & Rendering

## The loop itself

Always drive updates from `requestAnimationFrame`, never `setInterval`:
`setInterval` drifts, doesn't pause in a backgrounded tab the same way (so
it wastes battery and can queue up a burst of catch-up ticks), and isn't
synced to the display's actual refresh.

```js
let last = performance.now();
let acc = 0;
const STEP = 1 / 60; // fixed simulation step, seconds

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); // clamp: alt-tab shouldn't fast-forward physics
  last = now;
  acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; } // fixed-step simulation
  render(acc / STEP); // render with an interpolation factor for smoothness
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Use a **fixed timestep** (as above) when the game has physics, collision,
or anything where step size affects outcome (determinism, fairness,
reproducible replays). Use a plain **variable timestep** (`update(dt)`
called once per frame with the raw delta) when the game is simpler — UI-
driven, turn-based, or a management sim like a squad/roster game — and
simulation-step precision doesn't matter. Don't reach for the fixed-step
version by default; it's more code for a benefit most turn-based or
UI-heavy games don't need.

Pause behavior: listen for `visibilitychange` and stop calling
`requestAnimationFrame` (or at least skip `update`) when
`document.hidden` is true, so a backgrounded tab doesn't burn CPU or, worse,
accumulate a huge `dt` that then gets clamped into a stutter on return.

## Canvas rendering

- **Clear only what changed**, if the scene is mostly static — full-canvas
  `clearRect` + redraw every frame is fine for most 2D games up to a few
  hundred draw calls, but for anything bigger, dirty-rectangle tracking or
  layered canvases (a static background canvas + a dynamic foreground
  canvas) cuts redraw cost a lot.
- **Snap to integer pixel coordinates** for pixel-art style rendering to
  avoid blurry sub-pixel interpolation; for smooth/vector style rendering,
  leave sub-pixel positions alone — snapping there causes visible judder.
- **Batch by state**: group draw calls that share a fill style, a sprite
  sheet, or a blend mode together, rather than alternating; changing canvas
  context state (`fillStyle`, `globalAlpha`, `filter`) is not free.
- **Offscreen canvas for expensive static content**: pre-render a
  gradient, a tiled background, or a complex static shape to an offscreen
  canvas once, then `drawImage` it every frame instead of re-executing the
  drawing commands.
- For DOM/CSS-based games (moving `<div>`s instead of canvas), prefer
  `transform: translate3d(x, y, 0)` over `left`/`top` — it stays on the
  compositor thread and skips layout/paint. Add `will-change: transform`
  sparingly (only on elements that are actively animating) since it eats
  GPU memory per layer.

## Sprites & animation

A minimal sprite-sheet animator, frame-count driven rather than
`setInterval`-driven so it stays in sync with the render loop:

```js
function makeAnimator(frameCount, fps) {
  let t = 0;
  return {
    tick(dt) { t += dt; },
    frame() { return Math.floor(t * fps) % frameCount; },
  };
}
// draw: ctx.drawImage(sheet, anim.frame() * frameW, 0, frameW, frameH, x, y, frameW, frameH);
```

## Input handling

- Keyboard: track a `Set` of currently-held keys via `keydown`/`keyup`,
  read it inside `update()` — don't act directly inside the event handler
  for anything continuous (movement), only for discrete actions (menu
  select, pause).
- Pointer/touch: use `pointerdown`/`pointermove`/`pointerup` (unified API)
  instead of separate mouse and touch listeners — one code path for both,
  and it handles pen input too.
- Always call `ev.preventDefault()` on touch input that's part of the game
  surface, or the browser will try to scroll/zoom/select text underneath
  it. Don't call it globally on `touchstart` for the whole document if any
  part of the page (a settings panel, a text input) needs normal touch
  behavior.
- Debounce nothing that needs to feel responsive (movement, shooting);
  debounce things like window-resize-triggered relayouts.

## DOM-based UI over canvas rendering

Most non-arcade games (management sims, card games, puzzle/strategy) are
better built as styled DOM/CSS with a single delegated click handler (see
the main SKILL.md's Delegated Input pattern) than as canvas draw calls —
you get text layout, accessibility, and CSS transitions for free, and
there's no render loop needed at all beyond re-painting the DOM when state
changes. Reach for canvas specifically when you need per-pixel control,
many independently-moving objects, or effects DOM/CSS can't do cheaply
(particle systems, screen shake at the pixel level, custom blending).

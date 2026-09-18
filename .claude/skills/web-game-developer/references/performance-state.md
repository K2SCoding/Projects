# Performance & State

## Finding the actual bottleneck

Open DevTools → Performance, record a few seconds of steady-state play, and
look at three things before changing any code:

1. **The flame chart's widest frames** — is time going into your `update`,
   your `render`, or something unexpected (layout, style recalc, GC)?
2. **A sawtooth in the memory graph** — steady climb then a sharp drop is
   the garbage collector cleaning up per-frame allocations. That's almost
   always fixable with pooling (below).
3. **Purple "Layout"/"Recalculate Style" bars** inside a frame that also
   has script running — that's layout thrashing: you read a layout
   property (`offsetWidth`, `getBoundingClientRect`) after writing a style
   change, forcing the browser to synchronously recompute layout instead of
   batching it. Fix: do all your reads first, then all your writes.

Don't optimize what the profiler didn't flag. A management-sim game
repainting a few dozen DOM nodes per turn does not need object pooling; a
bullet-hell shooter spawning hundreds of particles a second does.

## Object pooling

Any object created and destroyed frequently (bullets, particles, enemies,
floating damage numbers) should come from a pool instead of `new`/literal
allocation + garbage collection:

```js
function createPool(create, reset) {
  const free = [];
  return {
    get() {
      const obj = free.pop() ?? create();
      return obj;
    },
    release(obj) {
      reset(obj);
      free.push(obj);
    },
  };
}

const particles = createPool(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, alive: false }),
  (p) => { p.alive = false; }
);

// spawn:
const p = particles.get();
p.x = originX; p.y = originY; p.vx = Math.random() * 2 - 1; p.life = 1; p.alive = true;

// per-frame update, iterate and release dead ones back to the pool — don't
// splice the active array mid-iteration; filter or swap-and-pop instead.
```

Pre-warm the pool at load time (`for (let i=0;i<200;i++) pool.release(pool.get())`)
so the first burst of spawns doesn't allocate anyway.

## Avoiding per-frame allocation more generally

- Reuse a scratch object/array for calculations instead of returning a new
  one from a hot function (`function addInto(out, a, b) { out.x = a.x+b.x; ... }`
  instead of `function add(a,b) { return {x:...} }`, when called every frame
  for many entities).
- Avoid creating closures inside the loop (`arr.forEach(x => ...)` allocates
  a new function reference in some engines if the callback captures loop
  state differently each time — prefer a plain `for` loop in genuinely hot
  paths, and don't over-apply this to code that isn't actually hot).
- String concatenation for UI text is fine outside the loop; avoid rebuilding
  large HTML strings every frame for fast-changing displays — update
  `textContent` on the specific node instead of re-rendering a subtree.

## Seeded randomness for determinism

Use a seeded PRNG instead of `Math.random()` whenever a result needs to be
reproducible: replay a match from a log, keep a multiplayer simulation fair
(same seed → same outcome on every client/server), or write a repeatable
test. `Math.random()` cannot be seeded in JS, so roll your own — mulberry32
is small, fast, and has good-enough statistical quality for games:

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}
// const rng = mulberry32(hashStringToInt("match|season1|week3"));
// const roll = rng(); // deterministic given the same seed
```

Derive the seed from something stable (a match ID, a week number, a save
slot) via a simple string hash (FNV-1a is a good small choice) so the same
logical event always reproduces the same rolls, independent of load order.

## State machines / screen management

Prefer an explicit state machine over scattered boolean flags
(`isPaused`, `isGameOver`, `inMenu`, ...) the moment you have more than two
or three states — flags combine in ways you didn't intend (paused *and*
game-over *and* in a modal), while a state machine makes illegal
combinations structurally impossible.

```js
const states = {};
let current = null, currentName = null;

function registerState(name, { enter, exit, update, render }) {
  states[name] = { enter, exit, update, render };
}

function goTo(name, ...args) {
  current?.exit?.();
  current = states[name];
  currentName = name;
  current.enter?.(...args);
}

// drive from the main loop:
function update(dt) { current?.update?.(dt); }
function render() { current?.render?.(); }
```

For a menu-heavy game (most non-arcade genres), this can *be* the whole
"screen manager" — each state owns showing/hiding its own DOM section
(`el.classList.toggle('on', name === currentName)`) rather than needing a
separate router library.

## Persistence

- `localStorage` is synchronous and small (a few MB) — fine for save
  games under that size; wrap every read/write in try/catch (it throws in
  private-browsing/storage-full/blocked-storage situations) and design the
  game to still boot into a sensible default state if load fails.
- For anything bigger (asset caches, large save data, structured queries),
  use IndexedDB instead — but for most single-player web games,
  `JSON.stringify`/`parse` through `localStorage` is simpler and sufficient.
- Namespace your keys (`myGame_save`, not `save`) — a shared origin (e.g. a
  wrapped Android WebView using `androidScheme: https, hostname: localhost`)
  can collide with other things using the same storage.

# Focus Timer

A fixed 2000 × 1200 board: a black timer column on the left, a WebGL shader
panel on the right that reacts to how much time is left.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 7 + TypeScript | Fast HMR, zero-config static output for Vercel |
| UI | React 19 | Small tree, hooks-based timer state |
| Shaders | three.js + @react-three/fiber | Standard WebGL layer; the render loop is where the uniforms get written, and render targets are needed for the reaction-diffusion pass |
| Hosting | Vercel (static) | `vercel.json` pins framework, build command and long-lived font caching |
| Type | Brown Logitech Web Pan (Light / Regular / Bold) | Self-hosted woff2 in `public/fonts` |

## Layout

The board is authored at exactly 2000 × 1200 and uniformly scaled to fit the
viewport (`useStageScale`), so every coordinate in `src/lib/design.ts` is a
literal artboard pixel taken from `design/TIMER.svg` — donut centre `(496, 439)`,
outer radius `253`, ring thickness `51`, slider at `243, 808`, button at
`243, 1028`. Nothing in the layout is responsive by design.

Type sizes were solved from the glyph ink boxes in the reference against the
font's own metrics (cap height 700/1000 upm), which is why text is positioned by
baseline rather than by centring — see `baselineTop()` in `src/lib/design.ts`.

## Behaviour

- **Ring** — drag anywhere on it to set the duration, up to 30:00. The drag
  accumulates angular delta rather than reading absolute angle, so sweeping past
  12 o'clock doesn't wrap 30:00 back to 00:00. Snaps to 30-second steps.
- **Readout** — the arc length is always `remaining / 30 minutes`, so the arc you
  dragged out is the arc that drains.
- **Slider** — present and draggable, deliberately **not wired to anything yet**.
  See `src/components/DurationSlider.tsx`.
- **Button** — Start → Pause → Resume → Reset. Space bar does the same.
- Countdown runs off a deadline timestamp, not accumulated deltas, so a
  backgrounded tab can't make it drift.

## The visuals

Three grayscale, black-on-white pieces live in `src/visuals/`. Switch with the
labels in the corner of the paper panel, or press `1` / `2` / `3`.

| | Technique | How it answers the clock |
| --- | --- | --- |
| **Foam** | CPU soft-body circle packing + SDF fragment shader | Bubbles burst one at a time as the clock drains, and the survivors shrink |
| **Growth** | Gray-Scott reaction-diffusion, ping-ponged between two half-float render targets | The fed disc contracts, so the structure is eaten back from its own frontier |
| **Wind** | Procedural dash field, no CPU state | Gusts fall away: dashes shorten, pale off and settle |

**Foam** (`foamSim.ts`, `foamShader.ts`) runs a contact-spring packing where
bubbles repel where they touch, pull together where they don't, and press
against a soft frame. At rest every pair is just tangent, which is what makes
the walls read as shared surfaces. Each surface is drawn in its own right rather
than by a union, so neighbours meet as two outlines instead of one silhouette
swallowing the other; the nearest-surface distance separately fills the curved
triangles where three bubbles meet. Bursting sets the radius spring's target to
zero, throws an impulse and a wobble into the neighbours, and leaves an expanding
ring behind.

**Growth** (`growthShaders.ts`) is Gray-Scott at 400×480, thresholded hard to
ink, and it genuinely runs backwards: it starts whole and is taken apart.

The disc *is* the clock — `radius = progress × 0.84` — so the retraction spans
exactly whatever duration is armed. Outside the fed radius the kill rate climbs,
so the frontier breaks into dots rather than fading.

The reaction only advances while the clock does, so pausing stops it dead. A
frozen pattern would be a dead panel, so the display shader shims the *sampling*
instead — a slow breath plus a low-frequency shimmer, which keeps the drawing
alive without evolving it.

Seeding a full disc is fussier than seeding a point. Two things it has to
respect: reagent covering much of the disc consumes the substrate everywhere at
once and the whole pattern dies inside a few hundred iterations, so the seed has
to be sparse; and radial spokes — much the prettier seed, and closer to the
reference — collapse in spacing towards the centre, merge into one mass there
and die for the same reason. Concentric rings hold their spacing at every
radius, so those are what it uses.

**Wind** (`windShader.ts`) samples a heading from one fbm read per cell and draws
a capsule along it, checking the 3×3 ring so dashes can overhang their cell.
Length carries local speed, thickness stays fixed. A drifting pocket of
turbulence scrambles headings where it passes.

### Shared uniforms

`useTimerUniforms()` in `visuals/common.ts` builds the block every visual gets,
written each frame from a mutable ref so the WebGL tree never re-renders on a
tick:

| Uniform | Meaning |
| --- | --- |
| `uTime` | Seconds since mount |
| `uProgress` | `1.0` at full duration → `0.0` at the buzzer (smoothed) |
| `uUrgency` | `1 - uProgress`, smoothed |
| `uRunning` | Smoothed `0..1`; is the clock actually counting |
| `uArmed` | Armed duration as a fraction of the 30-minute maximum |
| `uRemaining` | Raw seconds left, unsmoothed — for per-second effects |
| `uFinish` | Decays `1 → 0` over ~2.4s after completion |
| `uResolution` / `uAspect` | Panel size in device pixels, and its ratio |

To add a fourth, drop a component in `src/visuals/` and register it in
`visuals/index.ts`.

### Three things that will bite you

**three.js deep-clones the uniforms object you hand a material.** The object you
passed as a prop and the object the shader reads are different from the first
frame onward, so mutating your own copy animates nothing. Worse, it fails
*selectively*, which makes it look like something else entirely:

| In `cloneUniforms` | Result |
| --- | --- |
| Scalars copied by value | Slot goes stale immediately — froze the wind field at `t=0` |
| Arrays copied with `slice()` | New array, **same elements** — writing through `Vector4[]` kept working, so Foam looked fine |
| Render-target textures replaced with `null` | The reaction-diffusion display sampled nothing at all — blank white panel |

Always write through `material.uniforms` via a ref. `update()` in
`visuals/common.ts` takes the material for exactly this reason.


**`half` is a reserved word in GLSL ES.** So are `sample`, `filter`, `input`,
`output` and `flat`. Using one gives you a silent black panel, not an error you
can see from React.

**Rendering into a target the material still samples is a feedback loop** and
the driver answers by dropping the draw. The reseed in `Growth.tsx` clears
`uState` before writing to both targets for exactly this reason.

### Verifying without a render loop

`requestAnimationFrame` stops when the tab is hidden, which takes every visual
with it. Two dev-only pages at the repo root cover this; neither is part of the
production build.

`dev-verify.html` renders the shaders at fixed progress values in one
synchronous burst — thousands of reaction-diffusion steps included — using its
own renderer. Good for judging how something *looks*.

`dev-harness.html` mounts the real components in a real `<Canvas frameloop="never">`
and drives them with `advance()`, then **hashes the canvas pixels** each tick. It
also carries a probe: the same hook and material wiring behind a shader whose
only input is `uTime`. Comparing hashes across ticks is what caught the uniform
cloning above — screenshots of a hidden pane are routinely stale composites, so
comparing images by eye proves nothing.

## Running it

```bash
npm install
npm run dev
```

`npm run build` emits a static `dist/`. `npm run typecheck` runs `tsc`.

## Fonts

`public/fonts` contains Brown Logitech Web Pan converted to woff2. These are
licensed brand fonts — check the licence covers public redistribution before
making this repository public, or keep the repo private and serve the fonts from
a restricted origin.

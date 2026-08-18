# Focus Timer

A fixed 2000 × 1200 board: a black timer column on the left, a WebGL shader
panel on the right that reacts to how much time is left.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 7 + TypeScript | Fast HMR, zero-config static output for Vercel |
| UI | React 19 | Small tree, hooks-based timer state |
| Shader | three.js + @react-three/fiber | Standard WebGL layer; the render loop is where the uniforms get written |
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

## The shader

`src/shaders/field.ts` currently holds a **placeholder** — a disc that shrinks as
the clock drains. It exists to prove the wiring, not to be the artwork.

The plumbing around it is real and complete. `ShaderPanel.tsx` writes these
uniforms every frame from a mutable ref, so the WebGL tree never re-renders when
the countdown ticks:

| Uniform | Meaning |
| --- | --- |
| `uTime` | Seconds since mount |
| `uProgress` | `1.0` at full duration → `0.0` at the buzzer |
| `uUrgency` | `1 - uProgress`, exponentially smoothed |
| `uRunning` | Smoothed `0..1`; is the clock actually counting |
| `uArmed` | Armed duration as a fraction of the 30-minute maximum |
| `uRemaining` | Raw seconds left (unsmoothed — for per-second effects) |
| `uFinish` | Decays `1 → 0` over ~2.4s after completion |
| `uResolution` | Panel size in device pixels |

To drop in the real visualisation, replace the body of `main()` in
`field.ts`. Add uniforms there and in the `uniforms` object in
`ShaderPanel.tsx`; nothing else has to change.

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

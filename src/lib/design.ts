/**
 * Every number here is measured off design/TIMER.svg and expressed in artboard
 * pixels. The artboard is a fixed 2000 x 1200 board that gets uniformly scaled
 * to fit the viewport, so these values never need to become responsive.
 */

export const STAGE = { width: 2000, height: 1200 } as const

/** Black timer column on the left, paper-coloured shader column on the right. */
export const PANEL = { width: 1000 } as const

/** Content in the timer column is centred on x=496, not on the panel midpoint. */
export const CONTENT_CENTER_X = 496
export const CONTENT_BOX_WIDTH = CONTENT_CENTER_X * 2

export const DONUT = {
  cx: 496,
  cy: 439,
  outerRadius: 253,
  innerRadius: 202,
  /** Centre-line of the ring; what an SVG stroke is drawn along. */
  get radius() {
    return (this.outerRadius + this.innerRadius) / 2
  },
  get thickness() {
    return this.outerRadius - this.innerRadius
  },
} as const

export const SLIDER = {
  x: 243,
  y: 808,
  width: 506,
  height: 21,
  knob: 21,
  /** Knob position in the reference comp. */
  initialValue: 0.373,
} as const

export const BUTTON = { x: 243, y: 1028, width: 506, height: 70, radius: 35 } as const

export const COLORS = {
  ink: '#000000',
  paper: '#f6f6f6',
  muted: '#343434',
  white: '#ffffff',
} as const

/**
 * Brown Logitech reports hhea ascent 950 / descent -250 per 1000 upm, which is
 * what WebKit and Blink use to lay out the line box. With `line-height: 1` the
 * baseline therefore lands at `top + 0.85em`, which lets us position text by
 * the baselines measured in the comp.
 */
export const BASELINE_RATIO = 0.85

export function baselineTop(baselineY: number, fontSize: number): number {
  return baselineY - BASELINE_RATIO * fontSize
}

/** Type scale solved from the glyph ink boxes in the reference SVG. */
export const TYPE = {
  title: { size: 50, weight: 300, baseline: 119 },
  readout: { size: 48, weight: 700, baseline: 449 },
  label: { size: 24, weight: 300, baseline: 731 },
  button: { size: 36, weight: 700, baseline: 1074 },
} as const

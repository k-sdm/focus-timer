export const TAU = Math.PI * 2

/** Point on a circle, measured clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) }
}

/**
 * Arc starting at 12 o'clock and sweeping clockwise by `sweep` radians.
 * Returns null for a sweep too small to draw; callers should fall back to a
 * plain <circle> once the sweep closes on a full turn.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  sweep: number,
): string | null {
  if (sweep <= 1e-4) return null
  const clamped = Math.min(sweep, TAU - 1e-4)
  const a = polar(cx, cy, r, 0)
  const b = polar(cx, cy, r, clamped)
  const largeArc = clamped > Math.PI ? 1 : 0
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} 1 ${b.x} ${b.y}`
}

/** Angle of a point around a centre, clockwise from 12 o'clock, in (-PI, PI]. */
export function angleFrom(cx: number, cy: number, x: number, y: number): number {
  return Math.atan2(x - cx, cy - y)
}

/** Wrap a delta into (-PI, PI] so dragging past 12 o'clock doesn't jump. */
export function shortestDelta(delta: number): number {
  return delta - TAU * Math.round(delta / TAU)
}

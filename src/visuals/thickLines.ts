/**
 * Builds triangle geometry for wide strokes.
 *
 * WebGL caps `gl_LineWidth` at 1 on every desktop driver worth naming, so a
 * `LineSegments` can only ever be a hairline. Anything heavier has to be built
 * as quads. Each segment is extended by half its width at both ends, which
 * fills the joins where segments meet and lets overlapping strokes read as one
 * continuous mass rather than a chain of separate bars.
 */

/** Six vertices — two triangles — per segment. */
export const VERTS_PER_SEGMENT = 6

export function writeThickSegment(
  out: Float32Array,
  offset: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  halfWidth: number,
): number {
  let dx = x1 - x0
  let dy = y1 - y0
  const len = Math.hypot(dx, dy)

  if (len < 1e-9) {
    // Degenerate: draw a square cap so isolated points still show up.
    dx = 1
    dy = 0
  } else {
    dx /= len
    dy /= len
  }

  // Extend past both ends so consecutive segments overlap at their joins.
  const ex = dx * halfWidth
  const ey = dy * halfWidth
  const ax = x0 - ex
  const ay = y0 - ey
  const bx = x1 + ex
  const by = y1 + ey

  const nx = -dy * halfWidth
  const ny = dx * halfWidth

  let i = offset
  out[i++] = ax + nx; out[i++] = ay + ny; out[i++] = z
  out[i++] = ax - nx; out[i++] = ay - ny; out[i++] = z
  out[i++] = bx + nx; out[i++] = by + ny; out[i++] = z

  out[i++] = bx - nx; out[i++] = by - ny; out[i++] = z
  out[i++] = bx + nx; out[i++] = by + ny; out[i++] = z
  out[i++] = ax - nx; out[i++] = ay - ny; out[i++] = z
  return i
}

/** Repeats a per-segment value across its six vertices. */
export function writeSegmentAttribute(
  out: Float32Array,
  offset: number,
  value: number,
): number {
  let i = offset
  for (let k = 0; k < VERTS_PER_SEGMENT; k++) out[i++] = value
  return i
}

/**
 * Stroke weight shared across the line-drawn visuals, in clip-space units of
 * half the panel height. Matches the foam's walls so every visual reads as the
 * same tool.
 */
export const STROKE_HALF_WIDTH = 0.0075

import { noiseChunk } from './common'

export const SAND_COLS = 150
export const SAND_ROWS = 180

/**
 * Falling-liquid cellular automaton on a Margolus (block) neighbourhood: the
 * grid is partitioned into 2x2 blocks whose origin alternates between (0,0) and
 * (1,1) each step, and drops move *within* a block. That partitioning is what
 * makes this work on a GPU at all — every cell derives its own next value from
 * its block alone, so no drop is duplicated or lost, which a naive per-cell
 * "look at the neighbour above" rule cannot guarantee.
 *
 * What separates liquid from sand here is one extra rule: drops also move
 * sideways into space alongside them. Sand only falls and slides onto a
 * shoulder, so it heaps at its angle of repose; adding lateral flow is what
 * makes a body find its own level and behave like water.
 */
export const sandSimShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2  uGrid;
  /** 0 or 1: alternates the block partition each step. */
  uniform float uOffset;
  /** Per-cell chance of a new grain appearing in the inlet. */
  uniform float uSpawn;
  uniform float uTime;
  /**
   * Increments every step, so the rain is not identical within one frame.
   * Wrapped small deliberately: hash21 multiplies its input by ~456 before
   * taking a fract, so a counter in the thousands exhausts float precision and
   * the hash collapses to a constant.
   */
  uniform float uStep;
  uniform float uReset;

  ${noiseChunk}

  /**
   * 0 empty, 1 grain, 2 wall. Walls have to be a distinct state rather than
   * "occupied": treat the outside as a grain and every boundary becomes an
   * infinite source, pouring material into the grid from all four sides.
   */
  float cellAt(vec2 c) {
    if (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y) return 2.0;
    return texture2D(uState, (c + 0.5) / uGrid).r > 0.5 ? 1.0 : 0.0;
  }

  bool isGrain(float v) { return v > 0.5 && v < 1.5; }
  bool isEmpty(float v) { return v < 0.5; }

  void main() {
    if (uReset > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec2 c = floor(vUv * uGrid);
    vec2 b = floor((c - uOffset) * 0.5) * 2.0 + uOffset;
    vec2 local = c - b;

    float bl = cellAt(b);
    float br = cellAt(b + vec2(1.0, 0.0));
    float tl = cellAt(b + vec2(0.0, 1.0));
    float tr = cellAt(b + vec2(1.0, 1.0));

    // Straight down first.
    if (isGrain(tl) && isEmpty(bl)) { bl = 1.0; tl = 0.0; }
    if (isGrain(tr) && isEmpty(br)) { br = 1.0; tr = 0.0; }

    // Then the slide onto a shoulder. Which side is tried first alternates per
    // block, otherwise every heap leans the same way.
    float coin = hash21(b + uStep * 0.0071);
    if (coin < 0.5) {
      if (isGrain(tl) && !isEmpty(bl) && isEmpty(br)) { br = 1.0; tl = 0.0; }
      else if (isGrain(tr) && !isEmpty(br) && isEmpty(bl)) { bl = 1.0; tr = 0.0; }
    } else {
      if (isGrain(tr) && !isEmpty(br) && isEmpty(bl)) { bl = 1.0; tr = 0.0; }
      else if (isGrain(tl) && !isEmpty(bl) && isEmpty(br)) { br = 1.0; tl = 0.0; }
    }

    // Lateral flow — the rule that makes this water rather than sand. A swell
    // travelling across the grid biases which way it goes, so the body sloshes
    // and keeps a moving surface instead of settling to a dead flat line.
    float swell = sin(uTime * 1.15 - b.x * 0.085) * 0.62;
    float bias = hash21(b + uStep * 0.0139 + 5.0) * 2.0 - 1.0 + swell;
    // Not every block flows every step, which keeps the surface broken up.
    if (hash21(b + uStep * 0.0031 + 19.0) < 0.62) {
      if (bias > 0.0) {
        if (isGrain(bl) && isEmpty(br)) { br = 1.0; bl = 0.0; }
        else if (isGrain(tl) && isEmpty(tr)) { tr = 1.0; tl = 0.0; }
      } else {
        if (isGrain(br) && isEmpty(bl)) { bl = 1.0; br = 0.0; }
        else if (isGrain(tr) && isEmpty(tl)) { tl = 1.0; tr = 0.0; }
      }
    }

    float value = mix(mix(bl, br, local.x), mix(tl, tr, local.x), local.y);
    // Never write the wall sentinel back into the grid.
    value = isGrain(value) ? 1.0 : 0.0;

    // Inlet: a narrow column at the top, so the grid fills from a single
    // dropping stream the way a sand timer does.
    // Draining. Only drops with open sky above them go, so the level falls from
    // the surface down and stays flat rather than opening holes in the body.
    if (uDrain > 0.0 && isGrain(value) && isEmpty(cellAt(c + vec2(0.0, 1.0))) &&
        hash21(c + uStep * 0.0197 + 41.0) < uDrain) {
      value = 0.0;
    }

    // Rain: the inlet is the whole width, so the metered drops arrive scattered
    // and individual rather than as one stream from a single column. Both top
    // rows share a column hash, which makes each arrival a two-cell drop rather
    // than a lone pixel.
    float inlet = step(uGrid.y - 2.5, c.y);
    if (inlet > 0.5 && isEmpty(value) &&
        hash21(vec2(floor(c.x), uStep * 0.0113)) < uSpawn) {
      value = 1.0;
    }

    gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
  }
`

export const sandDisplayShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2  uGrid;
  uniform vec2  uResolution;
  uniform float uFinish;

  ${noiseChunk}

  void main() {
    vec2 g = vUv * uGrid;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;

    float filled = texture2D(uState, (id + 0.5) / uGrid).r;

    // Grains vary a little in size so the pile reads as loose material rather
    // than a screen-door pattern.
    float radius = 0.42 + hash21(id) * 0.09;
    float d = length(f);
    // One cell spans this many device pixels, which sets the edge softness.
    float aa = 1.15 / (uResolution.y / uGrid.y);
    float grain = 1.0 - smoothstep(radius - aa, radius + aa, d);

    vec3 col = mix(PAPER, INK, grain * filled);
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`

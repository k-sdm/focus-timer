import { noiseChunk } from './common'

export const SAND_COLS = 150
export const SAND_ROWS = 180

/**
 * Falling-sand cellular automaton on a Margolus (block) neighbourhood: the grid
 * is partitioned into 2x2 blocks whose origin alternates between (0,0) and
 * (1,1) each step, and grains are moved *within* a block. That partitioning is
 * what makes sand work on a GPU at all — every cell can decide its own next
 * value from its block alone, so no grain is ever duplicated or lost, which a
 * naive per-cell "look at the neighbour above" rule cannot guarantee.
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
    // block, otherwise every pile leans the same way.
    float coin = hash21(b + floor(uTime * 60.0) * 0.017);
    if (coin < 0.5) {
      if (isGrain(tl) && !isEmpty(bl) && isEmpty(br)) { br = 1.0; tl = 0.0; }
      else if (isGrain(tr) && !isEmpty(br) && isEmpty(bl)) { bl = 1.0; tr = 0.0; }
    } else {
      if (isGrain(tr) && !isEmpty(br) && isEmpty(bl)) { bl = 1.0; tr = 0.0; }
      else if (isGrain(tl) && !isEmpty(bl) && isEmpty(br)) { br = 1.0; tl = 0.0; }
    }

    float value = mix(mix(bl, br, local.x), mix(tl, tr, local.x), local.y);
    // Never write the wall sentinel back into the grid.
    value = isGrain(value) ? 1.0 : 0.0;

    // Inlet: a narrow column at the top, so the grid fills from a single
    // dropping stream the way a sand timer does.
    // Three cells wide and one deep: a thread, not a shower. Widening it just
    // scatters the same metered number of grains over more columns.
    float inlet = step(abs(c.x - uGrid.x * 0.5), 1.0) * step(uGrid.y - 1.5, c.y);
    if (inlet > 0.5 && value < 0.5 && hash21(c + uTime * 7.3) < uSpawn) {
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
    float radius = 0.38 + hash21(id) * 0.10;
    float d = length(f);
    // One cell spans this many device pixels, which sets the edge softness.
    float aa = 1.15 / (uResolution.y / uGrid.y);
    float grain = 1.0 - smoothstep(radius - aa, radius + aa, d);

    vec3 col = mix(PAPER, INK, grain * filled);
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`

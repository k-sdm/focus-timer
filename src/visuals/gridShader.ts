import { noiseChunk } from './common'

export const MAX_GRID_DEPTH = 8

export const gridFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uResolution;
  uniform float uAspect;
  uniform float uTime;
  uniform float uProgress;
  uniform float uUrgency;
  uniform float uRunning;
  uniform float uArmed;
  uniform float uRemaining;
  uniform float uFinish;

  ${noiseChunk}

  void main() {
    // The quadtree lives on a square spanning the panel width, centred, so the
    // last cell standing is a square rather than a stretched panel.
    vec2 q = vec2(vUv.x, (vUv.y - 0.5) / uAspect + 0.5);
    if (q.y < 0.0 || q.y > 1.0) {
      gl_FragColor = vec4(PAPER, 1.0);
      return;
    }

    // Depth is the clock. At the buzzer nothing subdivides and the whole square
    // is one cell.
    float depth = clamp(uProgress, 0.0, 1.0) * float(${MAX_GRID_DEPTH});

    float size = 1.0;
    for (int i = 0; i < ${MAX_GRID_DEPTH}; i++) {
      if (float(i) >= depth) break;

      vec2 id = floor(q / size);
      float h = hash21(id + vec2(float(i) * 31.7, float(i) * 13.1));
      // Each cell breathes on its own phase, so the tree keeps splitting and
      // merging rather than settling into one arrangement.
      h += 0.24 * sin(uTime * (0.22 + 0.4 * h) + h * 43.0);

      // A large-scale bias over the square, so dense regions and plain ones
      // form in patches rather than salt-and-pepper across the whole field.
      vec2 centre = (id + 0.5) * size;
      float bias = vnoise(centre * 2.4 + uTime * 0.04) * 0.17;

      // Deeper levels split less readily, which is what leaves large plain
      // cells sitting against dense ones.
      float chance = 0.87 - float(i) * 0.030 + bias;
      // The level being crossed fades in rather than popping.
      chance *= smoothstep(float(i), float(i) + 0.6, depth);
      if (h > chance) break;

      size *= 0.5;
    }

    vec2 f = fract(q / size);
    float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)) * size;
    // q spans the panel width, so one q-unit is uResolution.x device pixels.
    float edgePx = edge * uResolution.x;

    float lw = 1.15;
    float ink = 1.0 - smoothstep(lw, lw + 1.1, edgePx);

    // Outer boundary of the square.
    float border = min(min(q.x, q.y), min(1.0 - q.x, 1.0 - q.y)) * uResolution.x;
    ink = max(ink, 1.0 - smoothstep(lw, lw + 1.1, border));

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`

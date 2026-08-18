import { noiseChunk } from './common'

export const MAX_BIRDS = 52

export const boidsFragmentShader = /* glsl */ `
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

  /** xy = centre, zw = heading scaled by size. Size zero means gone. */
  uniform vec4  uBirds[${MAX_BIRDS}];
  /** Wingbeat, 0 folded to 1 spread. */
  uniform float uBeat[${MAX_BIRDS}];
  /** Fillet radius of the merge between neighbouring birds. */
  uniform float uMerge;

  ${noiseChunk}

  float fbm2(vec2 p) {
    return vnoise(p) * 0.6 + vnoise(p * 2.1 + 4.7) * 0.27 + vnoise(p * 4.3 + 9.1) * 0.13;
  }

  /** Polynomial smooth minimum: neighbours fuse instead of overlapping. */
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float capsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    // One field for the whole flock. Birds within the fillet of each other fuse
    // into a single mass, so a tight group reads as one stroke of ink and only
    // the stragglers keep their own silhouette.
    float field = 1e6;

    for (int i = 0; i < ${MAX_BIRDS}; i++) {
      vec4 b = uBirds[i];
      float size = length(b.zw);
      if (size <= 0.0001) continue;

      vec2 dir = b.zw / size;
      vec2 perp = vec2(-dir.y, dir.x);
      float beat = uBeat[i];

      // A chevron: two swept wings meeting at the tip.
      vec2 tip = b.xy + dir * size * 0.85;
      vec2 back = b.xy - dir * size * 0.5;
      vec2 wingL = back + perp * size * (0.35 + 0.85 * beat);
      vec2 wingR = back - perp * size * (0.35 + 0.85 * beat);
      float r = size * 0.27;

      float d = min(capsule(p, tip, wingL, r), capsule(p, tip, wingR, r));
      field = smin(field, d, uMerge);
    }

    // Painterly edge: the silhouette is broken up by noise at two scales, so it
    // reads as a loaded brush rather than a resolved outline.
    float rough = fbm2(p * 21.0 + uTime * 0.04) * 0.0038
                + fbm2(p * 58.0) * 0.0016;
    float d = field + rough;

    float aa = 1.8 / uResolution.y;
    float ink = 1.0 - smoothstep(-aa, aa, d);

    // Dry brush, biting hardest at the rim where a real stroke runs out of ink.
    // The band has to be scaled to the width of the strokes themselves: set
    // wider than they are thick and every pixel counts as rim, which speckles
    // the whole mass into crumbs.
    float bristle = fbm2(p * 74.0 + 13.0);
    float nearEdge = smoothstep(-0.009, 0.0, d);
    ink *= step(nearEdge * 0.48 - 0.14, bristle + 0.55);

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`

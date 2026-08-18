import { noiseChunk } from './common'

export const MAX_BUBBLES = 26
export const MAX_POPS = 6

export const foamFragmentShader = /* glsl */ `
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

  /** xy = centre, z = radius, w = wobble amplitude. z <= 0 means retired. */
  uniform vec4 uBubbles[${MAX_BUBBLES}];
  /** Unit vector of each bubble's wobble axis, precomputed on the CPU. */
  uniform vec2 uWobble[${MAX_BUBBLES}];
  /** xy = centre, z = age 0..1, w = radius at the moment it burst. */
  uniform vec4 uPops[${MAX_POPS}];

  uniform float uWall;
  uniform float uGap;

  ${noiseChunk}

  void main() {
    // Work in units where y spans [-0.5, 0.5]; x follows the panel aspect.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    float px = 1.0 / uResolution.y;
    float aa = px * 1.4;

    // Each surface is drawn in its own right, so two bubbles pressed together
    // read as two outlines meeting rather than one silhouette swallowing the
    // other. Alongside that, the nearest distance tells us where the curved
    // triangles between three bubbles are.
    float outline = 0.0;
    float nearest = 1e6;

    for (int i = 0; i < ${MAX_BUBBLES}; i++) {
      vec4 b = uBubbles[i];
      if (b.z <= 0.0) continue;

      vec2 q = p - b.xy;
      float qq = dot(q, q);

      // Elliptical surface-tension wobble. cos(2*theta) without an atan:
      // the projection onto the wobble axis already gives cos(theta).
      float proj = dot(q, uWobble[i]);
      float cos2 = 2.0 * proj * proj / max(qq, 1e-9) - 1.0;
      float r = b.z * (1.0 + b.w * cos2);

      float d = sqrt(qq) - r;
      outline = max(outline, 1.0 - smoothstep(uWall - aa, uWall + aa, abs(d)));
      nearest = min(nearest, d);
    }

    // Plateau borders: the pinch just outside every surface, which closes into
    // a solid wedge wherever three bubbles come together.
    float border = smoothstep(-aa, aa, nearest)
                 * (1.0 - smoothstep(uGap - aa, uGap + aa, nearest));

    float ink = max(outline, border);

    // Burst rings: a single expanding pulse where a bubble used to be.
    for (int j = 0; j < ${MAX_POPS}; j++) {
      vec4 pop = uPops[j];
      if (pop.z >= 1.0) continue;
      float ring = pop.w * (0.35 + 1.5 * pop.z);
      float dr = abs(length(p - pop.xy) - ring);
      float fade = (1.0 - pop.z) * (1.0 - pop.z);
      ink = max(ink, (1.0 - smoothstep(0.0, uWall * 0.9, dr)) * fade * 0.85);
    }

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.6);

    gl_FragColor = vec4(col, 1.0);
  }
`

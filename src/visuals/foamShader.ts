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
  /** Fillet radius of the merge between neighbouring bubbles. */
  uniform float uMerge;

  ${noiseChunk}

  /** Polynomial smooth minimum: the union necks instead of creasing. */
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  void main() {
    // Work in units where y spans [-0.5, 0.5]; x follows the panel aspect.
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    // Two fields at once: a smooth union that merges touching bubbles into one
    // mass, and the two nearest hard distances, whose midline is the shared
    // wall between whichever pair of bubbles owns this pixel.
    float mass = 1e6;
    float d1 = 1e6;
    float d2 = 1e6;

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
      mass = smin(mass, d, uMerge);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }

    float wallPx = uWall * uResolution.y;

    // Outer membrane of the merged mass. Antialiased against the field's own
    // gradient, so the edge stays one pixel soft at any window size.
    float aa = fwidth(mass) * 0.85;
    float shell = 1.0 - smoothstep(uWall - aa, uWall + aa, abs(mass));

    // Shared walls. The seam sits where the two nearest surfaces are
    // equidistant; dividing through the local gradient holds it to a constant
    // screen width however steeply the two fields cross.
    float sd = d2 - d1;
    float seamPx = sd / max(fwidth(sd), 1e-6);
    float seam = 1.0 - smoothstep(wallPx - 0.8, wallPx + 0.8, seamPx);
    // Only where there is actually a mass to divide. The gate is deliberately
    // tight: a soft one leaves grey haze wherever a wall runs out to the rim.
    seam *= smoothstep(0.0, uWall * 1.2, -mass);

    float ink = max(shell, seam);

    // Burst rings: a single expanding pulse where a bubble used to be.
    for (int j = 0; j < ${MAX_POPS}; j++) {
      vec4 pop = uPops[j];
      if (pop.z >= 1.0) continue;
      float ring = pop.w * (0.35 + 1.5 * pop.z);
      float dr = abs(length(p - pop.xy) - ring);
      float fade = (1.0 - pop.z) * (1.0 - pop.z);
      ink = max(ink, (1.0 - smoothstep(0.0, uWall * 1.4, dr)) * fade * 0.85);
    }

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.6);

    gl_FragColor = vec4(col, 1.0);
  }
`

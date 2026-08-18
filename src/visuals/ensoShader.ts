import { noiseChunk } from './common'

/**
 * The brush ring the flock circles. Drawn as an ink stroke rather than a
 * geometric annulus: the radius wanders, the width swells and tapers along the
 * sweep, and a noise field eats into it so the tail breaks into dry-brush
 * flecks the way a real enso does.
 */
export const ensoFragmentShader = /* glsl */ `
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

  const float TAU = 6.28318530718;
  /** Where the brush lands, and how far round it travels. */
  const float START = 2.55;
  const float SWEEP = 0.94;

  float fbm2(vec2 p) {
    return vnoise(p) * 0.62 + vnoise(p * 2.07 + 5.3) * 0.26 + vnoise(p * 4.1 + 11.9) * 0.12;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    p.y -= 0.012;

    float radius = length(p);
    float angle = atan(p.y, p.x);

    // Position along the stroke, 0 where the brush lands.
    float along = fract((START - angle) / TAU);
    if (along > SWEEP) {
      gl_FragColor = vec4(PAPER, 1.0);
      return;
    }
    float s = along / SWEEP;

    // The ring is not a circle: the arm wanders as it sweeps.
    float wander = fbm2(vec2(s * 5.2, uTime * 0.05)) * 0.022;
    float ring = 0.295 + wander;

    // Loaded and broad where it lands, running out towards the tail.
    float width = 0.046 * (0.42 + 0.85 * sin(s * 3.0 + 0.45)) * (1.0 - 0.55 * s);
    width *= 1.0 + fbm2(vec2(s * 22.0, 3.1)) * 0.35;

    float d = abs(radius - ring) - width;
    float aa = 2.2 / uResolution.y;
    float ink = 1.0 - smoothstep(-aa, aa, d);

    // Dry brush. The bristles bite harder further along the stroke, and harder
    // again as the clock empties, so the ring erodes rather than simply fading.
    float erosion = 1.0 - clamp(uProgress, 0.0, 1.0);
    float bristle = fbm2(vec2(s * 90.0, (radius - ring) * 120.0));
    float bite = 0.16 + 0.32 * s + 0.85 * erosion;
    ink *= step(bite * 0.85, bristle + 0.62);

    // The stroke is also eaten back from its tail as time runs out.
    ink *= 1.0 - smoothstep(1.0 - erosion * 1.15, 1.05 - erosion * 1.15, s);

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`

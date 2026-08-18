import { noiseChunk } from './common'

export const liquidFragmentShader = /* glsl */ `
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
    vec2 p = vUv;

    // The vessel fills as the clock empties: brim-full at the buzzer.
    float fill = 1.0 - clamp(uProgress, 0.0, 1.0);
    // Never quite empty: a shallow pool keeps the surface alive while the board
    // is sitting armed.
    float level = mix(0.035, 1.06, fill);

    float t = uTime;
    // More agitation early, when the surface is a long way from the brim, and a
    // little more again as the clock runs down.
    float agitation = mix(0.35, 1.0, uRunning) * (0.55 + 0.45 * uUrgency);

    // A few harmonics plus a slow bodily slosh, so it reads as liquid rather
    // than a rising rectangle.
    float w = 0.0;
    w += sin(p.x * 6.2 + t * 1.05) * 0.021;
    w += sin(p.x * 11.7 - t * 1.55) * 0.011;
    w += sin(p.x * 21.3 + t * 2.30) * 0.005;
    w += vnoise(vec2(p.x * 3.1, t * 0.34)) * 0.019;
    w += (p.x - 0.5) * sin(t * 0.62) * 0.038;

    float surface = level + w * agitation;
    float aa = 1.6 / uResolution.y;
    float ink = 1.0 - smoothstep(surface - aa, surface + aa, p.y);

    // Bubbles rising through the body, punched out of the fill.
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float seed = hash21(vec2(fi, 3.7));
      float lane = hash21(vec2(fi, 11.1));
      float rise = fract(seed * 7.3 + t * (0.05 + seed * 0.10));
      float radius = 0.009 + seed * 0.017;

      vec2 centre = vec2(
        0.10 + 0.80 * lane + sin(t * (0.6 + seed) + fi) * 0.018,
        rise * max(surface - radius * 2.0, 0.0));

      float d = length((p - centre) * vec2(uAspect, 1.0));
      // Fades in near the floor and pops just under the surface.
      float alive = smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.86, 1.0, rise));
      ink = min(ink, 1.0 - (1.0 - smoothstep(radius - aa, radius + aa, d)) * alive);
    }

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`

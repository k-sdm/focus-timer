import { noiseChunk } from './common'

/**
 * Gray-Scott reaction-diffusion. Left to itself it grows a branching labyrinth
 * out of a central seed; the shrinking active disc is what runs it backwards.
 */
export const growthSimShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2  uTexel;
  uniform float uAspect;
  uniform float uSeed;
  uniform float uFeed;
  uniform float uKill;
  uniform float uDt;
  /** Radius of the region still being fed, in half-heights. */
  uniform float uRadius;
  /** Storage gain, >1 when the state is packed into an 8-bit target. */
  uniform float uScale;

  ${noiseChunk}

  vec2 laplacian() {
    vec2 sum = vec2(0.0);
    sum += texture2D(uState, vUv + uTexel * vec2(-1.0, -1.0)).xy * 0.05;
    sum += texture2D(uState, vUv + uTexel * vec2( 0.0, -1.0)).xy * 0.20;
    sum += texture2D(uState, vUv + uTexel * vec2( 1.0, -1.0)).xy * 0.05;
    sum += texture2D(uState, vUv + uTexel * vec2(-1.0,  0.0)).xy * 0.20;
    sum += texture2D(uState, vUv                            ).xy * -1.00;
    sum += texture2D(uState, vUv + uTexel * vec2( 1.0,  0.0)).xy * 0.20;
    sum += texture2D(uState, vUv + uTexel * vec2(-1.0,  1.0)).xy * 0.05;
    sum += texture2D(uState, vUv + uTexel * vec2( 0.0,  1.0)).xy * 0.20;
    sum += texture2D(uState, vUv + uTexel * vec2( 1.0,  1.0)).xy * 0.05;
    return sum;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float d = length(p) * 2.0;

    if (uSeed > 0.5) {
      // Substrate everywhere, a pinch of reagent in the middle to grow from.
      // The whole disc is seeded at once, already carrying structure. Growing
      // it out from a central blob took tens of thousands of iterations before
      // it filled, which is the wrong way round for a piece that is supposed to
      // start whole and be taken apart.
      //
      // Rings close to the pattern's own wavelength, bent by a little noise,
      // give the relaxation a radial grain to follow — a plain noise seed
      // relaxes into isotropic mush and loses the spokes entirely.
      float rad = length(p);
      float inside = 1.0 - smoothstep(uRadius * 0.5 - 0.045, uRadius * 0.5, rad);
      // Thin rings, not bands. Reagent covering half the disc consumes the
      // substrate everywhere at once and the whole thing dies inside a few
      // hundred iterations; sparse seeds leave A intact to grow into.
      // Concentric rings, bent by a little noise. Radial spokes are the prettier
      // seed and read closer to the reference, but their spacing collapses
      // towards the middle: the reagent merges into one mass there, consumes the
      // substrate and the whole disc dies inside a few hundred iterations.
      // Rings hold their spacing at every radius, so they survive.
      float rings = smoothstep(0.62, 0.98, sin(rad * 300.0 + vnoise(p * 6.0) * 3.2));
      float speck = step(0.994, hash21(vUv * 733.0));
      float seeded = inside * clamp(rings * 0.5 + speck * 0.5, 0.0, 0.55);
      gl_FragColor = vec4(1.0, clamp(seeded * uScale, 0.0, 1.0), 0.0, 1.0);
      return;
    }

    vec2 s = texture2D(uState, vUv).xy;
    float a = s.x;
    float b = s.y / uScale;
    vec2 lap = laplacian();
    lap.y /= uScale;

    // Outside the active radius the kill rate climbs, so the structure is eaten
    // back from its own frontier rather than simply fading out. The ragged
    // dotted edge that leaves behind is the whole point of running it in reverse.
    float edge = smoothstep(uRadius - 0.16, uRadius + 0.03, d);
    float feed = uFeed * (1.0 - edge * 0.85);
    float kill = uKill + edge * 0.022;

    float reaction = a * b * b;
    float na = a + (0.2097 * lap.x - reaction + feed * (1.0 - a)) * uDt;
    float nb = b + (0.1050 * lap.y + reaction - (kill + feed) * b) * uDt;

    gl_FragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb * uScale, 0.0, 1.0), 0.0, 1.0);
  }
`

export const growthDisplayShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uState;
  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uRunning;
  uniform float uFinish;
  uniform float uScale;

  ${noiseChunk}

  void main() {
    // While the clock is stopped the reaction is frozen, so the movement has to
    // come from the sampling instead: a slow breath plus a low-frequency
    // shimmer, which keeps the drawing alive without evolving it.
    float still = 1.0 - clamp(uRunning, 0.0, 1.0);
    float t = uTime;

    vec2 uv = vUv;
    vec2 shimmer = vec2(
      sin(uv.y * 9.0 + t * 0.85) + 0.55 * sin(uv.y * 17.0 - t * 0.6),
      cos(uv.x * 8.0 - t * 0.7) + 0.55 * cos(uv.x * 15.0 + t * 0.48));
    uv += shimmer * 0.0034 * still;
    uv = (uv - 0.5) * (1.0 + sin(t * 0.45) * 0.007 * still) + 0.5;

    float b = texture2D(uState, uv).y / uScale;

    // Hard threshold, antialiased against the local gradient — the reference is
    // ink, not a heightmap.
    float w = fwidth(b) * 1.1 + 0.004;
    float ink = smoothstep(0.16 - w, 0.16 + w, b);

    vec3 col = mix(PAPER, INK, ink);
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.7);
    gl_FragColor = vec4(col, 1.0);
  }
`

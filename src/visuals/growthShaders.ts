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
      // Seeded only in the middle. Scattering reagent across the whole field
      // would nucleate everywhere at once and lose the radial grain that comes
      // from a single front travelling outwards.
      float blob = 1.0 - smoothstep(0.025, 0.070, length(p));
      float jitter = hash21(vUv * 733.0) * 0.35 + 0.65;
      gl_FragColor = vec4(1.0, clamp(blob * 0.62 * jitter * uScale, 0.0, 1.0), 0.0, 1.0);
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
  uniform float uFinish;
  uniform float uScale;

  ${noiseChunk}

  void main() {
    float b = texture2D(uState, vUv).y / uScale;

    // Hard threshold, antialiased against the local gradient — the reference is
    // ink, not a heightmap.
    float w = fwidth(b) * 1.1 + 0.004;
    float ink = smoothstep(0.16 - w, 0.16 + w, b);

    vec3 col = mix(PAPER, INK, ink);
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.7);
    gl_FragColor = vec4(col, 1.0);
  }
`

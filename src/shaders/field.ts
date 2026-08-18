/**
 * PLACEHOLDER SHADER.
 *
 * Deliberately simple — it exists to prove the wiring, not to be the artwork.
 * Every uniform the real visualisation is likely to want is already declared,
 * populated every frame in ShaderPanel.tsx, and smoothed where it should be.
 * Replace the body of `main()` (and add uniforms as needed) when the real
 * treatment is specified; nothing outside this file has to change.
 */

export const fieldVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // Fullscreen quad: bypass the camera entirely so the plane always covers
    // the viewport regardless of projection.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const fieldFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2  uResolution;
  uniform float uTime;
  /** 1.0 with the full duration left, 0.0 at the buzzer. */
  uniform float uProgress;
  /** 1.0 - uProgress, smoothed. */
  uniform float uUrgency;
  /** Smoothed 0..1: is the clock actually counting down. */
  uniform float uRunning;
  /** Armed duration as a fraction of the 30 minute maximum. */
  uniform float uArmed;
  /** Seconds left, unsmoothed. */
  uniform float uRemaining;
  /** Decays 1 -> 0 over a couple of seconds once the timer completes. */
  uniform float uFinish;

  const vec3 PAPER = vec3(0.965, 0.965, 0.965);
  const vec3 INK   = vec3(0.086, 0.090, 0.098);

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

    float u = clamp(uUrgency, 0.0, 1.0);

    // A disc that shrinks as the clock drains, breathing while it runs.
    float breathe = sin(uTime * mix(0.6, 2.4, u)) * 0.012 * uRunning;
    float radius = mix(0.06, 0.34, clamp(uProgress, 0.0, 1.0)) + breathe;
    float disc = 1.0 - smoothstep(radius - 0.02, radius + 0.02, length(p));

    vec3 col = mix(PAPER, INK, disc * 0.9);

    // Completion flash.
    col = mix(col, vec3(1.0), clamp(uFinish, 0.0, 1.0) * 0.8);

    gl_FragColor = vec4(col, 1.0);
  }
`

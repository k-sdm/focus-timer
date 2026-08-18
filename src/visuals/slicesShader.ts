import { noiseChunk } from './common'

export const SLICE_COUNT = 14

export const slicesFragmentShader = /* glsl */ `
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

  /**
   * The underlying picture: rings of tangent circles on a staggered lattice,
   * drawn as soft ink bands rather than hard outlines, matching the blurred
   * look of the reference.
   */
  float picture(vec2 p) {
    // Very large circles, so the arcs crossing the frame are shallow and read
    // as broad horizontal bands. Smaller ones cross steeply and the picture
    // turns into a dense vertical weave.
    float cell = 1.55;
    vec2 g = vec2(p.x / cell, p.y / (cell * 0.87));
    float row = floor(g.y);
    g.x += mod(row, 2.0) * 0.5;

    float ink = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 id = vec2(floor(g.x) + float(dx), row + float(dy));
        vec2 centre = vec2(
          (id.x + 0.5 - mod(id.y, 2.0) * 0.5) * cell,
          (id.y + 0.5) * cell * 0.87);
        float r = cell * 0.54;
        float d = abs(length(p - centre) - r);
        // Gaussian band: the reference's edges are soft, not crisp.
        ink = max(ink, exp(-d * d / 0.00020));
      }
    }
    return ink;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    float count = float(${SLICE_COUNT});
    float strip = floor(vUv.x * count);

    // Every strip carries its own random offset, scaled by how much time is
    // left: fully scrambled at the start, dead aligned at the buzzer.
    float scramble = clamp(uProgress, 0.0, 1.0);
    float offset = (hash21(vec2(strip, 7.3)) - 0.5) * 0.85 * scramble;
    // Strips keep creeping while the clock runs, so the picture never sits
    // still until it is actually finished.
    offset += sin(uTime * 0.22 + strip * 1.7) * 0.035 * scramble;

    float ink = picture(vec2(p.x, p.y + offset));

    // The cuts themselves: a hairline gap at every strip boundary.
    float edge = abs(fract(vUv.x * count) - 0.5) * 2.0;
    float cut = smoothstep(0.985, 1.0, edge);
    ink *= 1.0 - cut * 0.85;

    vec3 col = mix(PAPER, INK, clamp(ink, 0.0, 1.0));
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`

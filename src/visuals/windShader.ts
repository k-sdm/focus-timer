import { noiseChunk } from './common'

export const windFragmentShader = /* glsl */ `
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

  /** The heading everything converges on once the air is still. */
  const float REST_HEADING = 0.0;

  float fbm2(vec2 p) {
    return vnoise(p) * 0.65 + vnoise(p * 2.03 + 11.7) * 0.35;
  }

  /**
   * Heading of the wind at a point. One fbm read rather than a curl of four,
   * because this gets evaluated nine times per pixel.
   */
  float heading(vec2 p, float t) {
    // The sampling point itself is advected, so the whole field streams across
    // the panel rather than shimmering in place.
    vec2 flowing = p * 1.35 + vec2(t * 0.42, -t * 0.30);
    float base = fbm2(flowing);
    float swirl = atan(p.y, p.x + 1e-4) * 0.35;
    return base * 3.1 + swirl + t * 0.55;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    // Intensity falls away with the clock: the gale settles to still air.
    float gust = clamp(uProgress, 0.0, 1.0);
    // How far the field has settled towards a single heading. Eased so the
    // alignment gathers through the run rather than snapping at the end.
    float settle = pow(1.0 - gust, 1.4);
    gust = mix(0.20, 1.0, gust * gust);
    // Never fully still: an idle board should still read as weather.
    float t = uTime * mix(0.30, 1.0, gust) * mix(0.70, 1.0, uRunning);

    float cell = 0.0345;
    vec2 g = p / cell;
    vec2 base = floor(g);

    float px = 1.0 / uResolution.y;
    float aa = px * 1.2;
    float ink = 0.0;
    float tone = 0.0;

    // A dash can reach into its neighbours, so sample the ring around this cell.
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = base + vec2(float(i), float(j));
        vec2 jitter = (hash22(id) - 0.5) * 0.30;
        vec2 c = (id + 0.5 + jitter) * cell;

        // Local wind speed, plus a pocket of turbulence that drifts across.
        float speed = fbm2(c * 2.1 + vec2(-t * 0.55, t * 0.38)) * 0.5 + 0.5;
        vec2 eye = vec2(sin(t * 0.31) * 0.24, cos(t * 0.23) * 0.17);
        float churn = smoothstep(0.34, 0.06, length(c - eye)) * gust;

        float a = heading(c, t);
        a += churn * (hash21(id + 3.7) - 0.5) * 5.4 * (1.0 - settle);
        // Gusts pass through as a travelling wave, so dashes turn in sequence
        // rather than all at once.
        a += sin(dot(c, vec2(2.4, -1.7)) - t * 1.6) * 0.35 * gust * (1.0 - settle);

        // Air coming to rest: every reading swings round to the same heading,
        // so the field ends as one set of parallel strokes.
        a = mix(a, REST_HEADING, settle);

        speed = clamp(speed * gust + churn * 0.35 * (1.0 - settle), 0.0, 1.0);
        // Lengths even out as they align, so the end state is a regular field.
        speed = mix(speed, 0.30, settle);

        // Length carries the speed; thickness stays put so the field reads as
        // one instrument taking readings rather than strokes of varying weight.
        // ('half' is a reserved word in GLSL ES, hence 'reach'.)
        float reach = cell * mix(0.13, 0.46, speed);
        float thick = cell * 0.055;

        vec2 dir = vec2(cos(a), sin(a));
        vec2 q = p - c;
        float h = clamp(dot(q, dir), -reach, reach);
        float d = length(q - dir * h) - thick;

        float mark = 1.0 - smoothstep(-aa, aa, d);
        if (mark > ink) {
          ink = mark;
          tone = speed;
        }
      }
    }

    // Grayscale weight: the faster the reading, the darker the mark.
    vec3 mark = mix(vec3(0.50), INK, clamp(tone * 1.35, 0.0, 1.0));
    vec3 col = mix(PAPER, mark, ink);
    col = mix(col, PAPER, clamp(uFinish, 0.0, 1.0) * 0.7);

    gl_FragColor = vec4(col, 1.0);
  }
`

import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAX_DURATION_SEC, type TimerFrame } from '../hooks/useTimer'

/** Fullscreen quad that bypasses the camera entirely. */
export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export interface VisualProps {
  frame: React.RefObject<TimerFrame>
}

/** Frame-rate independent exponential approach. */
export function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

const FINISH_DECAY_SEC = 2.4

/**
 * The uniform block every visual receives.
 *
 * This is only ever a *template*. three.js deep-clones the uniforms it is
 * handed when the material is built (`UniformsUtils.cloneUniforms`), so the
 * object here and the object the shader actually reads are different from the
 * first frame onward. Writing to this one animates nothing.
 *
 * Two details of that clone are worth knowing, because they decide what breaks
 * and what quietly keeps working:
 *
 *  - scalars are copied by value, so a `{ value: number }` slot goes stale
 *    immediately — this is what froze the wind field at t=0;
 *  - arrays are copied with `slice()`, so the array is new but its elements are
 *    the same objects — which is why writing through `Vector4[]` entries went on
 *    working, and made the bug look like it only affected some visuals;
 *  - render-target textures are replaced with `null` outright, which is why the
 *    reaction-diffusion display sampled nothing at all.
 *
 * So `update()` takes the material and writes into `material.uniforms`. Do the
 * same for any uniform a visual adds of its own.
 */
export function createTimerUniforms() {
  return {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uProgress: { value: 1 },
    uUrgency: { value: 0 },
    uRunning: { value: 0 },
    uArmed: { value: 0 },
    uRemaining: { value: 0 },
    uFinish: { value: 0 },
  }
}

export function useTimerUniforms() {
  const uniforms = useMemo(createTimerUniforms, [])
  const smooth = useRef({ urgency: 0, running: 0, armed: 0, progress: 1 })

  const update = useCallback(
    (
      material: THREE.ShaderMaterial | null,
      frame: TimerFrame,
      dt: number,
      width: number,
      height: number,
    ) => {
      if (!material) return null
      const u = material.uniforms
      const s = smooth.current

      // Smoothed so a scrub of the ring reads as the field following your hand.
      s.urgency = approach(s.urgency, frame.urgency, 3.5, dt)
      s.progress = approach(s.progress, frame.progress, 3.5, dt)
      s.running = approach(s.running, frame.running ? 1 : 0, 2.2, dt)
      s.armed = approach(s.armed, frame.duration / MAX_DURATION_SEC, 4.0, dt)

      u.uTime.value += dt
      u.uProgress.value = s.progress
      u.uUrgency.value = s.urgency
      u.uRunning.value = s.running
      u.uArmed.value = s.armed
      u.uRemaining.value = frame.remaining
      u.uFinish.value = Math.max(0, 1 - frame.sinceFinish / FINISH_DECAY_SEC)
      ;(u.uResolution.value as THREE.Vector2).set(width, height)
      u.uAspect.value = width / Math.max(height, 1)

      return u
    },
    [],
  )

  return { uniforms, update }
}

/** Shared GLSL: value noise, and the black-on-white palette. */
export const noiseChunk = /* glsl */ `
  const vec3 PAPER = vec3(1.0);
  const vec3 INK   = vec3(0.04);

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec2 hash22(vec2 p) {
    return vec2(hash21(p), hash21(p + 71.3));
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
  }
`

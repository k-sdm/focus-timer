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

export interface TimerUniformValues {
  [uniform: string]: { value: unknown }
  uResolution: { value: THREE.Vector2 }
  uAspect: { value: number }
  uTime: { value: number }
  uProgress: { value: number }
  uUrgency: { value: number }
  uRunning: { value: number }
  uArmed: { value: number }
  uRemaining: { value: number }
  uFinish: { value: number }
}

const FINISH_DECAY_SEC = 2.4

/**
 * The uniform block every visual receives. Smoothed values are eased here so a
 * scrub of the ring reads as the field following your hand rather than snapping.
 */
export function useTimerUniforms() {
  const uniforms = useMemo<TimerUniformValues>(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uUrgency: { value: 0 },
      uRunning: { value: 0 },
      uArmed: { value: 0 },
      uRemaining: { value: 0 },
      uFinish: { value: 0 },
    }),
    [],
  )

  const smooth = useRef({ urgency: 0, running: 0, armed: 0, progress: 1 })

  const update = useCallback(
    (frame: TimerFrame, dt: number, width: number, height: number) => {
      const s = smooth.current
      s.urgency = approach(s.urgency, frame.urgency, 3.5, dt)
      s.progress = approach(s.progress, frame.progress, 3.5, dt)
      s.running = approach(s.running, frame.running ? 1 : 0, 2.2, dt)
      s.armed = approach(s.armed, frame.duration / MAX_DURATION_SEC, 4.0, dt)

      uniforms.uTime.value += dt
      uniforms.uProgress.value = s.progress
      uniforms.uUrgency.value = s.urgency
      uniforms.uRunning.value = s.running
      uniforms.uArmed.value = s.armed
      uniforms.uRemaining.value = frame.remaining
      uniforms.uFinish.value = Math.max(0, 1 - frame.sinceFinish / FINISH_DECAY_SEC)
      uniforms.uResolution.value.set(width, height)
      uniforms.uAspect.value = width / Math.max(height, 1)
    },
    [uniforms],
  )

  return { uniforms, update, smooth }
}

/** Shared GLSL: value noise + fbm, black-on-white palette. */
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

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { approach, fullscreenVertexShader, type VisualProps } from './common'
import { fbm3 } from './reliefField'
import { MAX_DURATION_SEC } from '../hooks/useTimer'

const ROWS = 34
const COLS = 156
const MAX_SEGMENTS = ROWS * (COLS - 1)

/** Extent of the plot in clip space. */
const LEFT = -0.88
const RIGHT = 0.88
const FRONT_Y = -0.74
const BACK_Y = 0.54
/** Rows narrow towards the back, which is the only depth cue a flat plot gets. */
const BACK_SQUEEZE = 0.8
const MAX_AMPLITUDE = 0.42

const lineFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(0.055, 0.058, 0.066, 1.0); }
`

const paperFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }
`

/**
 * Stacked ridgelines through a 3D noise field, in the manner of the Unknown
 * Pleasures plot. Hidden-line removal is the floating-horizon algorithm: walk
 * the rows from front to back holding the highest silhouette reached in each
 * column, and draw only what clears it. Doing this on the CPU costs one pass
 * over ~5k points a frame and leaves a single draw call, where resolving it per
 * pixel would mean evaluating every row's height at every pixel.
 */
export function Relief({ frame }: VisualProps) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3),
    )
    g.setDrawRange(0, 0)
    return g
  }, [])

  const scratch = useMemo(
    () => ({
      horizon: new Float32Array(COLS),
      y: new Float32Array(COLS),
      visible: new Uint8Array(COLS),
    }),
    [],
  )

  const state = useRef({ time: 0, amplitude: 0 })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const t = frame.current
    const s = state.current
    s.time += dt

    // Relief flattens as the clock empties; at the buzzer the rows are level
    // and parallel.
    const target = Math.max(0, Math.min(1, t.progress))
    s.amplitude = approach(s.amplitude, target, 2.5, dt)
    // A longer timer earns a slightly taller landscape.
    const amp = MAX_AMPLITUDE * s.amplitude * (0.75 + 0.25 * (t.duration / MAX_DURATION_SEC))

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const array = positions.array as Float32Array
    const { horizon, y, visible } = scratch

    horizon.fill(-Infinity)
    let cursor = 0

    for (let r = 0; r < ROWS; r++) {
      const rowT = r / (ROWS - 1)
      const baseY = FRONT_Y + (BACK_Y - FRONT_Y) * rowT
      const squeeze = 1 - (1 - BACK_SQUEEZE) * rowT

      for (let c = 0; c < COLS; c++) {
        const colT = c / (COLS - 1)
        const nx = (colT - 0.5) * 2

        // A mound in the middle of the plot, so the rows read as one landform.
        const d = Math.hypot(nx * 1.05, (rowT - 0.42) * 1.9)
        const envelope = Math.max(0, 1 - d)
        const env = envelope * envelope

        // Value-noise fbm lands around +/-0.4. Rectified and given a shoulder,
        // it becomes the upward spikes the plot is built on rather than a
        // symmetrical wobble either side of the baseline.
        const n = fbm3(nx * 1.9, rowT * 2.6, s.time * 0.22)
        const spike = Math.max(0, n + 0.10) * 2.4
        const h = Math.pow(spike, 1.35)
        y[c] = baseY + h * env * amp
      }

      for (let c = 0; c < COLS; c++) {
        visible[c] = y[c] > horizon[c] ? 1 : 0
        if (y[c] > horizon[c]) horizon[c] = y[c]
      }

      for (let c = 0; c < COLS - 1; c++) {
        if (!visible[c] || !visible[c + 1]) continue
        const x0 = LEFT + (RIGHT - LEFT) * (c / (COLS - 1))
        const x1 = LEFT + (RIGHT - LEFT) * ((c + 1) / (COLS - 1))
        array[cursor++] = x0 * squeeze
        array[cursor++] = y[c]
        array[cursor++] = 0
        array[cursor++] = x1 * squeeze
        array[cursor++] = y[c + 1]
        array[cursor++] = 0
      }
    }

    positions.needsUpdate = true
    geometry.setDrawRange(0, cursor / 3)
  })

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={fullscreenVertexShader}
          fragmentShader={paperFragmentShader}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      <lineSegments frustumCulled={false} geometry={geometry}>
        <shaderMaterial
          vertexShader={fullscreenVertexShader}
          fragmentShader={lineFragmentShader}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>
    </>
  )
}

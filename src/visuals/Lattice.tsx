import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { approach, clipVertexShader, type VisualProps } from './common'
import { noise3 } from './reliefField'
import { STROKE_HALF_WIDTH, VERTS_PER_SEGMENT, writeThickSegment } from './thickLines'

const COLS = 34
const ROWS = 41
/** Drifting attractors that pull the grid lines into knots. */
const KNOTS = 10

const SEGMENTS = COLS * (ROWS - 1) + ROWS * (COLS - 1)

const lineFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(0.09, 0.09, 0.10, 1.0); }
`

const paperFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }
`

/**
 * A wireframe grid pulled into tangles by drifting attractors, relaxing back to
 * a clean regular grid as the clock empties. The pinch is the same shape as the
 * reference: vertices near a knot are drawn toward it, so grid lines bundle
 * into the point and fan back out.
 */
export function Lattice({ frame }: VisualProps) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(SEGMENTS * VERTS_PER_SEGMENT * 3), 3),
    )
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  const state = useRef({ time: 0, tangle: 1 })
  const verts = useMemo(() => new Float32Array(COLS * ROWS * 2), [])

  useFrame((_, delta) => {
    const t = frame.current
    // A deliberate pause stops the animation; merely being armed does not.
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    const s = state.current
    s.time += dt

    // Fully tangled with the full duration ahead, straight at the buzzer.
    s.tangle = approach(s.tangle, Math.max(0, Math.min(1, t.progress)), 2.5, dt)
    const tangle = s.tangle

    // Knots wander slowly; their pull fades with the tangle.
    const knots: number[] = []
    for (let k = 0; k < KNOTS; k++) {
      knots.push(
        noise3(k * 7.31 + 2.1, 0.5, s.time * 0.05 + k) * 0.9,
        noise3(0.5, k * 5.17 + 8.8, s.time * 0.045 + k * 3.3) * 1.0,
        0.16 + 0.12 * (0.5 + 0.5 * Math.sin(k * 2.4 + s.time * 0.2)),
        k % 2 === 0 ? 1 : -1,
      )
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 2
        // Overscans the frame, so the knots can pull vertices inward without
        // stripping the grid off the edges.
        let x = (c / (COLS - 1) - 0.5) * 2.36
        let y = (r / (ROWS - 1) - 0.5) * 2.36

        // Base wobble so even the mid-tangle state reads as woven, not warped.
        x += noise3(x * 2.1, y * 2.1, s.time * 0.07) * 0.09 * tangle
        y += noise3(x * 2.3 + 9.7, y * 2.3, s.time * 0.06) * 0.09 * tangle
        x += noise3(x * 5.4 + 3.3, y * 5.4, s.time * 0.11) * 0.035 * tangle
        y += noise3(x * 5.9 + 17.2, y * 5.9, s.time * 0.09) * 0.035 * tangle

        for (let k = 0; k < KNOTS; k++) {
          const kx = knots[k * 4]
          const ky = knots[k * 4 + 1]
          const kr = knots[k * 4 + 2]
          const spin = knots[k * 4 + 3]
          const dx = kx - x
          const dy = ky - y
          const pull = Math.exp(-(dx * dx + dy * dy) / (kr * kr)) * 0.92 * tangle

          // Drawn toward the knot and wound around it. A pure pinch only
          // gathers lines into a point; the rotation is what makes them cross
          // each other and read as genuinely tangled.
          x += dx * pull - dy * pull * 0.85 * spin
          y += dy * pull + dx * pull * 0.85 * spin
        }

        verts[i] = x
        verts[i + 1] = y
      }
    }

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const array = positions.array as Float32Array
    let cursor = 0
    const put = (a: number, b: number) => {
      cursor = writeThickSegment(
        array,
        cursor,
        verts[a],
        verts[a + 1],
        verts[b],
        verts[b + 1],
        0,
        STROKE_HALF_WIDTH,
      )
    }
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS - 1; c++)
        put((r * COLS + c) * 2, (r * COLS + c + 1) * 2)
    for (let r = 0; r < ROWS - 1; r++)
      for (let c = 0; c < COLS; c++)
        put((r * COLS + c) * 2, ((r + 1) * COLS + c) * 2)

    positions.needsUpdate = true
  })

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={clipVertexShader}
          fragmentShader={paperFragmentShader}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh frustumCulled={false} geometry={geometry}>
        <shaderMaterial
          vertexShader={clipVertexShader}
          fragmentShader={lineFragmentShader}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

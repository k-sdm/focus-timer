import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { approach, fullscreenVertexShader, type VisualProps } from './common'
import { ridged3 } from './reliefField'
import { MAX_DURATION_SEC } from '../hooks/useTimer'

/** Concentric rings, sampled all the way round. */
const RINGS = 40
const SECTORS = 132
const VERTS = RINGS * SECTORS

/** Cavalier projection: x across, depth receding, height up. */
const SCALE_X = 0.82
const SCALE_DEPTH = 0.30
const SCALE_HEIGHT = 0.88
const BASE_Y = -0.44
const MAX_AMPLITUDE = 1.40

/** Positions arrive already in clip space, so the camera plays no part. */
const passThroughVertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xyz, 1.0); }
`

const lineFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(0.10, 0.10, 0.11, 1.0); }
`

const paperFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }
`

/**
 * A relief of an island, drawn as the contour rings running round it.
 *
 * Hidden surfaces are resolved by the depth buffer rather than by a horizon
 * scan: the terrain is also rendered as an opaque white shell that writes depth
 * but no visible colour, and the rings are drawn against it. That works for a
 * closed form, where a floating-horizon pass over rows does not — a ring
 * crosses in front of and behind the peaks within a single line, so there is no
 * front-to-back ordering to walk.
 */
export function Relief({ frame }: VisualProps) {
  const { positions, surface, rings } = useMemo(() => {
    const positions = new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3)

    // Both geometries read the same vertices; only the topology differs.
    const surface = new THREE.BufferGeometry()
    surface.setAttribute('position', positions)
    const tris: number[] = []
    for (let r = 0; r < RINGS - 1; r++) {
      for (let s = 0; s < SECTORS; s++) {
        const s1 = (s + 1) % SECTORS
        const a = r * SECTORS + s
        const b = r * SECTORS + s1
        const c = (r + 1) * SECTORS + s
        const d = (r + 1) * SECTORS + s1
        tris.push(a, c, b, b, c, d)
      }
    }
    surface.setIndex(tris)

    const rings = new THREE.BufferGeometry()
    rings.setAttribute('position', positions)
    const lines: number[] = []
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < SECTORS; s++) {
        lines.push(r * SECTORS + s, r * SECTORS + ((s + 1) % SECTORS))
      }
    }
    rings.setIndex(lines)

    return { positions, surface, rings }
  }, [])

  useEffect(
    () => () => {
      surface.dispose()
      rings.dispose()
    },
    [surface, rings],
  )

  const state = useRef({ time: 0, amplitude: 0 })

  useFrame((_, delta) => {
    const t = frame.current
    // A deliberate pause stops the animation; merely being armed does not.
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    const s = state.current
    s.time += dt

    const target = Math.max(0, Math.min(1, t.progress))
    s.amplitude = approach(s.amplitude, target, 2.2, dt)
    const amp =
      MAX_AMPLITUDE * s.amplitude * (0.78 + 0.22 * (t.duration / MAX_DURATION_SEC))
    // Fine detail goes before height does, so the island wears down rather than
    // simply sinking.
    const detail = Math.pow(s.amplitude, 0.75)

    const array = positions.array as Float32Array
    let i = 0

    for (let r = 0; r < RINGS; r++) {
      const rr = r / (RINGS - 1)

      // Island profile: a steep core carrying the peaks, ringed by a broad low
      // shelf so the form sits on a shoal rather than rising out of nothing.
      const core = Math.max(0, 1 - rr)
      const shelf =
        0.20 *
        Math.max(0, Math.min(1, (1.02 - rr) / 0.30)) *
        Math.max(0, Math.min(1, (rr - 0.46) / 0.26))
      const env = Math.pow(core, 1.7) + shelf

      for (let sec = 0; sec < SECTORS; sec++) {
        const a = (sec / SECTORS) * Math.PI * 2
        const x = Math.cos(a) * rr
        const depth = Math.sin(a) * rr

        const h = ridged3(x * 2.5, depth * 2.5, s.time * 0.16, detail) * env * amp

        array[i++] = x * SCALE_X
        array[i++] = depth * SCALE_DEPTH + h * SCALE_HEIGHT + BASE_Y
        // Nearer the viewer is a smaller depth value; height barely tilts it.
        array[i++] = depth * 0.42
      }
    }

    positions.needsUpdate = true
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

      {/* Depth-only shell. Paints white so it is invisible against the page, but
          it is what hides the rings running behind the far side of the form. */}
      <mesh frustumCulled={false} geometry={surface} renderOrder={0}>
        <shaderMaterial
          vertexShader={passThroughVertexShader}
          fragmentShader={paperFragmentShader}
          depthTest
          depthWrite
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      <lineSegments frustumCulled={false} geometry={rings} renderOrder={1}>
        <shaderMaterial
          vertexShader={passThroughVertexShader}
          fragmentShader={lineFragmentShader}
          depthTest
          depthWrite={false}
        />
      </lineSegments>
    </>
  )
}

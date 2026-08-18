import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  clipVertexShader,
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { ensoFragmentShader } from './ensoShader'

const FLOCK = 96
/** Two triangles a bird, three vertices each. */
const VERTS = FLOCK * 6

/** Sim space: y spans [-0.5, 0.5], x follows the panel aspect. */
// Outside the brush stroke, which sits at 0.295 with roughly 0.05 of width.
// Overlapping it hides the flock entirely — black birds on black ink.
const RING_RADIUS = 0.365

/**
 * Flocking leads and the ring only biases. With the ring in charge the birds
 * space themselves evenly around it and read as beads on a wire; letting
 * separation, alignment and cohesion dominate keeps them a clump that happens
 * to be traveling in a circle.
 */
const SEPARATION_RANGE = 0.042
const NEIGHBOUR_RANGE = 0.115
const SEPARATION = 2.6
const ALIGNMENT = 1.35
const COHESION = 0.85
const RING_PULL = 3.0
/** Bleeds off motion across the ring, which is what holds an orbit. */
const RADIAL_DAMPING = 2.4
const TANGENT = 0.62
const CRUISE = 0.215
const RING_CENTRE_Y = 0.012

interface Bird {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  flap: number
  flapRate: number
  /** Released birds stop circling and leave; they never rejoin. */
  free: boolean
}

const birdFragmentShader = /* glsl */ `
  precision highp float;
  void main() { gl_FragColor = vec4(0.05, 0.05, 0.06, 1.0); }
`

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A flock holding a ring, thinning as the clock empties. Birds are released a
 * few at a time rather than all drifting outward together: a flock that simply
 * expands reads as one object growing, where birds peeling off one by one reads
 * as departure.
 */
export function Boids({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { update } = useTimerUniforms()
  const enso = useRef<THREE.ShaderMaterial>(null)
  const ensoUniforms = useMemo(createTimerUniforms, [])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  const flock = useMemo(() => {
    const rand = mulberry(0xb1d5)
    const birds: Bird[] = []
    // Started as one loose group rather than sprinkled round the circle: a
    // flock that begins evenly spread never really gathers.
    const seed = rand() * Math.PI * 2
    for (let i = 0; i < FLOCK; i++) {
      const a = seed + (rand() - 0.5) * 1.5
      const r = RING_RADIUS * (0.82 + rand() * 0.36)
      birds.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r + RING_CENTRE_Y,
        vx: -Math.sin(a) * CRUISE,
        vy: Math.cos(a) * CRUISE,
        size: 0.013 + rand() * 0.014,
        flap: rand() * Math.PI * 2,
        flapRate: 8 + rand() * 7,
        free: false,
      })
    }
    return birds
  }, [])

  const state = useRef({ released: 0 })

  useFrame((_, delta) => {
    const t = frame.current
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    update(enso.current, t, dt, size.width * dpr, size.height * dpr)

    const aspect = size.width / Math.max(size.height, 1)

    // Release birds in step with the clock.
    const wanted = Math.round((1 - Math.max(0, Math.min(1, t.progress))) * FLOCK)
    while (state.current.released < wanted) {
      const bird = flock[state.current.released]
      bird.free = true
      // Leaves on a tangent, biased outward, so departures fan off the ring.
      const nx = bird.x
      const ny = bird.y - RING_CENTRE_Y
      const len = Math.hypot(nx, ny) || 1
      bird.vx += (nx / len) * 0.22
      bird.vy += (ny / len) * 0.22
      state.current.released++
    }
    if (wanted === 0 && state.current.released > 0) {
      flock.forEach((b) => (b.free = false))
      state.current.released = 0
    }

    for (let i = 0; i < FLOCK; i++) {
      const b = flock[i]
      b.flap += b.flapRate * dt

      if (b.free) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        continue
      }

      let sepX = 0
      let sepY = 0
      let aliX = 0
      let aliY = 0
      let cohX = 0
      let cohY = 0
      let neighbours = 0

      for (let j = 0; j < FLOCK; j++) {
        if (j === i) continue
        const o = flock[j]
        if (o.free) continue
        const dx = b.x - o.x
        const dy = b.y - o.y
        const d2 = dx * dx + dy * dy
        if (d2 > NEIGHBOUR_RANGE * NEIGHBOUR_RANGE || d2 < 1e-9) continue

        if (d2 < SEPARATION_RANGE * SEPARATION_RANGE) {
          // Falls off with distance, so crowding pushes far harder than
          // merely being close.
          const inv = 1 / d2
          sepX += dx * inv
          sepY += dy * inv
        }
        aliX += o.vx
        aliY += o.vy
        cohX += o.x
        cohY += o.y
        neighbours++
      }

      b.vx += sepX * SEPARATION * 0.0016 * dt
      b.vy += sepY * SEPARATION * 0.0016 * dt

      if (neighbours > 0) {
        b.vx += (aliX / neighbours - b.vx) * ALIGNMENT * dt
        b.vy += (aliY / neighbours - b.vy) * ALIGNMENT * dt
        b.vx += (cohX / neighbours - b.x) * COHESION * dt
        b.vy += (cohY / neighbours - b.y) * COHESION * dt
      }

      // The ring, applied gently underneath the flocking.
      const nx = b.x
      const ny = b.y - RING_CENTRE_Y
      const r = Math.hypot(nx, ny) || 1e-6
      b.vx += (nx / r) * (RING_RADIUS - r) * RING_PULL * dt
      b.vy += (ny / r) * (RING_RADIUS - r) * RING_PULL * dt
      b.vx += (-ny / r) * TANGENT * dt
      b.vy += (nx / r) * TANGENT * dt

      // Damp only the component crossing the ring. Left undamped the spring
      // and the cruise speed trade energy and the flock spirals out of frame;
      // tangential motion is untouched, so they still circulate freely.
      const radial = (b.vx * nx + b.vy * ny) / r
      b.vx -= (nx / r) * radial * RADIAL_DAMPING * dt
      b.vy -= (ny / r) * radial * RADIAL_DAMPING * dt

      const speed = Math.hypot(b.vx, b.vy) || 1e-6
      b.vx = (b.vx / speed) * (speed + (CRUISE - speed) * 2.4 * dt)
      b.vy = (b.vy / speed) * (speed + (CRUISE - speed) * 2.4 * dt)

      b.x += b.vx * dt
      b.y += b.vy * dt
    }

    // Build the silhouettes. Clip x is divided through the aspect so a bird
    // keeps its shape in a panel that is taller than it is wide.
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const array = positions.array as Float32Array
    const sx = 2 / aspect
    let c = 0

    for (let i = 0; i < FLOCK; i++) {
      const b = flock[i]
      const heading = Math.atan2(b.vy, b.vx)
      const cos = Math.cos(heading)
      const sin = Math.sin(heading)
      const beat = 0.34 + 0.66 * Math.abs(Math.sin(b.flap))

      const put = (lx: number, ly: number) => {
        const wx = b.x + (lx * cos - ly * sin) * b.size
        const wy = b.y + (lx * sin + ly * cos) * b.size
        array[c++] = wx * sx
        array[c++] = wy * 2
        array[c++] = 0
      }

      // Chevron: tip forward, a wing either side, notched at the tail.
      put(1.0, 0)
      put(-0.62, 0.95 * beat)
      put(-0.2, 0)
      put(1.0, 0)
      put(-0.2, 0)
      put(-0.62, -0.95 * beat)
    }

    positions.needsUpdate = true

  })

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={enso}
          key={ensoFragmentShader}
          vertexShader={fullscreenVertexShader}
          fragmentShader={ensoFragmentShader}
          uniforms={ensoUniforms}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      <mesh frustumCulled={false} geometry={geometry}>
        <shaderMaterial
          vertexShader={clipVertexShader}
          fragmentShader={birdFragmentShader}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  )
}

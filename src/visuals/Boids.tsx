import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { MAX_BIRDS, boidsFragmentShader } from './boidsShader'

/** Sim space: y spans [-0.5, 0.5], x follows the panel aspect. */
const RING_RADIUS = 0.285
const RING_CENTRE_Y = 0.0

/**
 * Flocking leads and the ring only biases. With the ring in charge the birds
 * space themselves evenly around it and read as beads on a wire; letting
 * separation, alignment and cohesion dominate keeps them a clump that happens
 * to be travelling in a circle.
 */
const SEPARATION_RANGE = 0.038
const NEIGHBOUR_RANGE = 0.105
const SEPARATION = 3.0
const ALIGNMENT = 1.35
const COHESION = 0.9
const RING_PULL = 4.2
/** Bleeds off motion across the ring, which is what holds an orbit. */
const RADIAL_DAMPING = 3.4
const TANGENT = 0.6
const CRUISE = 0.2
/** Nothing is allowed further out than this, so the flock stays on the page. */
const MAX_RADIUS = 0.4

interface Bird {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  flap: number
  flapRate: number
  free: boolean
  /** Fades out as a departing bird leaves, rather than clipping at the edge. */
  presence: number
}

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
 * A flock circling as one mass of ink, thinning as birds peel off and leave.
 * Nothing draws the ring — the flock's own path is the only thing describing
 * it, which is what keeps the ink and the birds reading as one drawing.
 */
export function Boids({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { update } = useTimerUniforms()
  const material = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      ...createTimerUniforms(),
      uBirds: {
        value: Array.from({ length: MAX_BIRDS }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      uBeat: { value: new Array<number>(MAX_BIRDS).fill(0.5) },
      uMerge: { value: 0.018 },
    }),
    [],
  )

  const flock = useMemo(() => {
    const rand = mulberry(0xb1d5)
    const birds: Bird[] = []
    // One loose group rather than sprinkled round the circle: a flock that
    // begins evenly spread never really gathers.
    const seed = rand() * Math.PI * 2
    for (let i = 0; i < MAX_BIRDS; i++) {
      const a = seed + (rand() - 0.5) * 1.6
      const r = RING_RADIUS * (0.85 + rand() * 0.3)
      birds.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r + RING_CENTRE_Y,
        vx: -Math.sin(a) * CRUISE,
        vy: Math.cos(a) * CRUISE,
        size: 0.019 + rand() * 0.015,
        flap: rand() * Math.PI * 2,
        flapRate: 7 + rand() * 6,
        free: false,
        presence: 1,
      })
    }
    return birds
  }, [])

  const released = useRef(0)
  const generation = useRef(-1)

  useFrame((_, delta) => {
    const t = frame.current
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    const u = update(material.current, t, dt, size.width * dpr, size.height * dpr)
    if (!u) return

    if (t.generation !== generation.current) {
      generation.current = t.generation
      flock.forEach((b) => {
        b.free = false
        b.presence = 1
      })
      released.current = 0
    }

    const wanted = Math.round((1 - Math.max(0, Math.min(1, t.progress))) * MAX_BIRDS)

    // Time added mid-session calls birds back onto the ring rather than
    // stranding them off frame.
    while (released.current > wanted) {
      released.current--
      const bird = flock[released.current]
      const a = Math.random() * Math.PI * 2
      bird.free = false
      bird.presence = 1
      bird.x = Math.cos(a) * RING_RADIUS
      bird.y = Math.sin(a) * RING_RADIUS + RING_CENTRE_Y
      bird.vx = -Math.sin(a) * CRUISE
      bird.vy = Math.cos(a) * CRUISE
    }

    while (released.current < wanted) {
      const bird = flock[released.current]
      bird.free = true
      const nx = bird.x
      const ny = bird.y - RING_CENTRE_Y
      const len = Math.hypot(nx, ny) || 1
      bird.vx += (nx / len) * 0.2
      bird.vy += (ny / len) * 0.2
      released.current++
    }
    for (let i = 0; i < MAX_BIRDS; i++) {
      const b = flock[i]
      b.flap += b.flapRate * dt

      if (b.free) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        // Thins out on the way rather than vanishing at the frame edge.
        b.presence = Math.max(0, b.presence - dt * 0.5)
        continue
      }

      let sepX = 0
      let sepY = 0
      let aliX = 0
      let aliY = 0
      let cohX = 0
      let cohY = 0
      let neighbours = 0

      for (let j = 0; j < MAX_BIRDS; j++) {
        if (j === i) continue
        const o = flock[j]
        if (o.free) continue
        const dx = b.x - o.x
        const dy = b.y - o.y
        const d2 = dx * dx + dy * dy
        if (d2 > NEIGHBOUR_RANGE * NEIGHBOUR_RANGE || d2 < 1e-9) continue

        if (d2 < SEPARATION_RANGE * SEPARATION_RANGE) {
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

      b.vx += sepX * SEPARATION * 0.0014 * dt
      b.vy += sepY * SEPARATION * 0.0014 * dt

      if (neighbours > 0) {
        b.vx += (aliX / neighbours - b.vx) * ALIGNMENT * dt
        b.vy += (aliY / neighbours - b.vy) * ALIGNMENT * dt
        b.vx += (cohX / neighbours - b.x) * COHESION * dt
        b.vy += (cohY / neighbours - b.y) * COHESION * dt
      }

      const nx = b.x
      const ny = b.y - RING_CENTRE_Y
      const r = Math.hypot(nx, ny) || 1e-6
      b.vx += (nx / r) * (RING_RADIUS - r) * RING_PULL * dt
      b.vy += (ny / r) * (RING_RADIUS - r) * RING_PULL * dt
      b.vx += (-ny / r) * TANGENT * dt
      b.vy += (nx / r) * TANGENT * dt

      // Damp only the component crossing the ring. Left undamped the spring and
      // the cruise speed trade energy and the flock spirals out of frame.
      const radial = (b.vx * nx + b.vy * ny) / r
      b.vx -= (nx / r) * radial * RADIAL_DAMPING * dt
      b.vy -= (ny / r) * radial * RADIAL_DAMPING * dt

      const speed = Math.hypot(b.vx, b.vy) || 1e-6
      b.vx = (b.vx / speed) * (speed + (CRUISE - speed) * 2.6 * dt)
      b.vy = (b.vy / speed) * (speed + (CRUISE - speed) * 2.6 * dt)

      b.x += b.vx * dt
      b.y += b.vy * dt

      // Hard ceiling on the orbit. Cohesion can drag the whole group wide, and
      // once it is off the page there is nothing to watch.
      const out = Math.hypot(b.x, b.y - RING_CENTRE_Y)
      if (out > MAX_RADIUS) {
        const k = MAX_RADIUS / out
        b.x *= k
        b.y = RING_CENTRE_Y + (b.y - RING_CENTRE_Y) * k
      }
    }

    const birds = u.uBirds.value as THREE.Vector4[]
    const beats = u.uBeat.value as number[]
    for (let i = 0; i < MAX_BIRDS; i++) {
      const b = flock[i]
      const heading = Math.atan2(b.vy, b.vx)
      const scale = b.size * b.presence
      birds[i].set(b.x, b.y, Math.cos(heading) * scale, Math.sin(heading) * scale)
      beats[i] = 0.35 + 0.65 * Math.abs(Math.sin(b.flap))
    }
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        key={boidsFragmentShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={boidsFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

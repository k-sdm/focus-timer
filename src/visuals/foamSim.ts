import { MAX_BUBBLES, MAX_POPS } from './foamShader'

export interface Bubble {
  x: number
  y: number
  vx: number
  vy: number
  /** Current radius; springs toward `rest`. */
  r: number
  rv: number
  /** Radius this bubble wants to be, before the global shrink is applied. */
  base: number
  rest: number
  /** Surface-tension wobble: amplitude decays, axis rotates. */
  amp: number
  angle: number
  spin: number
  alive: boolean
}

export interface Pop {
  x: number
  y: number
  age: number
  radius: number
}

const REPULSION = 150
const COHESION = 3.0
const CENTRE_PULL = 1.0
const DAMPING = 3.4
/** Soft frame the foam presses against, so it packs to the edges of the panel. */
const WALL = 90
const WALL_MARGIN = 0.012
const SUBSTEPS = 3
const RADIUS_STIFFNESS = 170
const RADIUS_DAMPING = 13
/** A bursting bubble collapses far faster than it breathes. */
const COLLAPSE_STIFFNESS = 620
const COLLAPSE_DAMPING = 34

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
 * Soft-body foam. Bubbles repel on contact and pull together when apart, so the
 * cluster settles with every pair just touching — which is what makes the walls
 * read as shared surfaces rather than overlapping outlines.
 */
export class FoamSim {
  bubbles: Bubble[] = []
  pops: Pop[] = []
  private rand = mulberry(0x5eed)
  private aspect = 1

  constructor(aspect: number) {
    this.aspect = aspect
    this.reset()
  }

  reset() {
    this.rand = mulberry(0x5eed)
    this.bubbles = []
    this.pops = []
    const halfW = this.aspect / 2

    // A deliberate mix rather than a random spread: a few anchors that set the
    // scale, a working middle, and crumbs to fill the corners between them.
    const sizes: number[] = []
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const t = i / (MAX_BUBBLES - 1)
      sizes.push(
        t < 0.2 ? 0.125 + this.rand() * 0.032
        : t < 0.62 ? 0.070 + this.rand() * 0.036
        : 0.026 + this.rand() * 0.026,
      )
    }
    // Shuffle so the anchors don't all land in one corner of the seed layout.
    for (let i = sizes.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1))
      ;[sizes[i], sizes[j]] = [sizes[j], sizes[i]]
    }

    for (let i = 0; i < MAX_BUBBLES; i++) {
      const base = sizes[i]
      const a = this.rand() * Math.PI * 2
      const rad = Math.sqrt(this.rand()) * 0.40
      this.bubbles.push({
        x: Math.cos(a) * rad * (halfW / 0.5),
        y: Math.sin(a) * rad,
        vx: 0,
        vy: 0,
        r: base,
        rv: 0,
        base,
        rest: base,
        amp: 0,
        angle: this.rand() * Math.PI,
        spin: (this.rand() - 0.5) * 1.6,
        alive: true,
      })
    }
  }

  get aliveCount() {
    let n = 0
    for (const b of this.bubbles) if (b.alive) n++
    return n
  }

  /** Burst the smallest live bubble and let the neighbours rush into the gap. */
  pop() {
    let victim: Bubble | null = null
    for (const b of this.bubbles) {
      if (!b.alive) continue
      if (!victim || b.base < victim.base) victim = b
    }
    if (!victim) return

    victim.alive = false
    victim.rest = 0
    // A real bubble bulges a hair before it goes.
    victim.rv = victim.r * 1.6
    victim.amp = 0.18

    this.pops.unshift({ x: victim.x, y: victim.y, age: 0, radius: victim.r })
    this.pops.length = Math.min(this.pops.length, MAX_POPS)

    for (const b of this.bubbles) {
      if (!b.alive || b === victim) continue
      const dx = victim.x - b.x
      const dy = victim.y - b.y
      const d = Math.hypot(dx, dy)
      if (d > victim.r * 4.5 || d < 1e-5) continue
      const falloff = 1 - d / (victim.r * 4.5)
      const kick = falloff * falloff * victim.r * 5.2
      b.vx += (dx / d) * kick
      b.vy += (dy / d) * kick
      // Volume the burst bubble was holding gets shared out as a wobble.
      b.rv += falloff * victim.r * 0.9
      b.amp = Math.min(0.22, b.amp + falloff * 0.16)
      b.angle = Math.atan2(dy, dx)
    }
  }

  step(dt: number, shrink: number) {
    // Stiff contact springs need small steps; three substeps keeps the packing
    // from exploding when several bubbles burst at once.
    const total = Math.min(dt, 1 / 45)
    for (let n = 0; n < SUBSTEPS; n++) this.substep(total / SUBSTEPS, shrink)
    for (const pop of this.pops) pop.age = Math.min(1, pop.age + total * 1.9)
  }

  private substep(h: number, shrink: number) {
    const bs = this.bubbles
    const halfW = this.aspect / 2 - WALL_MARGIN
    const halfH = 0.5 - WALL_MARGIN

    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]
      if (a.r <= 0) continue

      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j]
        if (b.r <= 0) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1e-6
        const touch = a.r + b.r
        const nx = dx / d
        const ny = dy / d

        if (d < touch) {
          // Contact pressure. Stiff, so overlap stays small and the shared wall
          // stays a single line.
          const f = (touch - d) * REPULSION * h
          a.vx -= nx * f
          a.vy -= ny * f
          b.vx += nx * f
          b.vy += ny * f
        } else if (d < touch * 1.9) {
          const f = (d - touch) * COHESION * h
          a.vx += nx * f
          a.vy += ny * f
          b.vx -= nx * f
          b.vy -= ny * f
        }
      }

      // Hold the cluster together so it contracts as bubbles are lost.
      a.vx -= a.x * CENTRE_PULL * h
      a.vy -= a.y * CENTRE_PULL * h

      // Soft frame: the foam fills the panel rather than floating inside it.
      if (a.x - a.r < -halfW) a.vx += (-halfW - (a.x - a.r)) * WALL * h
      if (a.x + a.r > halfW) a.vx -= (a.x + a.r - halfW) * WALL * h
      if (a.y - a.r < -halfH) a.vy += (-halfH - (a.y - a.r)) * WALL * h
      if (a.y + a.r > halfH) a.vy -= (a.y + a.r - halfH) * WALL * h

      const damp = Math.exp(-DAMPING * h)
      a.vx *= damp
      a.vy *= damp
      a.x += a.vx * h
      a.y += a.vy * h

      // Radius spring.
      const dying = !a.alive
      const k = dying ? COLLAPSE_STIFFNESS : RADIUS_STIFFNESS
      const c = dying ? COLLAPSE_DAMPING : RADIUS_DAMPING
      a.rest = a.alive ? a.base * shrink : 0
      a.rv += ((a.rest - a.r) * k - a.rv * c) * h
      a.r += a.rv * h
      if (a.r < 0.0015) {
        a.r = 0
        a.rv = 0
      }

      a.amp *= Math.exp(-2.6 * h)
      a.angle += a.spin * h
    }
  }
}

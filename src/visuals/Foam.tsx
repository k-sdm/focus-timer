/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { MAX_BUBBLES, MAX_POPS, foamFragmentShader } from './foamShader'
import { FoamSim } from './foamSim'

export function Foam({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  // Device pixels, not CSS: antialiasing widths are derived from uResolution
  // and would soften as the window shrinks if this were the CSS size.
  const dpr = useThree((s) => s.viewport.dpr)
  const { update } = useTimerUniforms()
  const aspect = size.width / Math.max(size.height, 1)

  // Built once. Resizing the window nudges the aspect by a rounding error, and
  // rebuilding on that would scatter the cluster every time the slider moves.
  const sim = useMemo(() => new FoamSim(aspect), [])
  sim.aspect = aspect
  const material = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      ...createTimerUniforms(),
      uBubbles: {
        value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      uWobble: {
        value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector2(1, 0)),
      },
      uPops: {
        value: Array.from({ length: MAX_POPS }, () => new THREE.Vector4(0, 0, 1, 0)),
      },
      uWall: { value: 0.0042 },
      uMerge: { value: 0.028 },
    }),
    [],
  )

  const generation = useRef(-1)

  useEffect(() => {
    sim.reset()
    generation.current = -1
  }, [sim])

  useFrame((_, delta) => {
    const t = frame.current
    // A deliberate pause stops the animation; merely being armed does not.
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    // Everything is written through the material: the uniforms object above is
    // only a template, and three clones it when the material is built.
    const u = update(material.current, t, dt, size.width * dpr, size.height * dpr)
    if (!u) return

    // A fresh session rebuilds the cluster outright.
    if (t.generation !== generation.current) {
      generation.current = t.generation
      sim.reset()
    }

    // Bubbles retire in step with the clock: full cluster at the start, one
    // left at the buzzer. Time added mid-session brings them back rather than
    // simply halting the decline.
    const wanted = Math.max(1, Math.round(t.progress * MAX_BUBBLES))
    if (sim.aliveCount > wanted) sim.pop()
    else if (sim.aliveCount < wanted) sim.revive()

    // ...and the survivors close down as well, so the foam shrinks overall.
    sim.step(dt, 0.72 + 0.28 * t.progress)

    const bubbles = u.uBubbles.value as THREE.Vector4[]
    const wobble = u.uWobble.value as THREE.Vector2[]
    const pops = u.uPops.value as THREE.Vector4[]

    for (let i = 0; i < MAX_BUBBLES; i++) {
      const b = sim.bubbles[i]
      bubbles[i].set(b.x, b.y, b.r, b.amp)
      wobble[i].set(Math.cos(b.angle), Math.sin(b.angle))
    }
    for (let i = 0; i < MAX_POPS; i++) {
      const p = sim.pops[i]
      if (p) pops[i].set(p.x, p.y, p.age, p.radius)
      else pops[i].set(0, 0, 1, 0)
    }
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        key={foamFragmentShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={foamFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

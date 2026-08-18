import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { fullscreenVertexShader, useTimerUniforms, type VisualProps } from './common'
import { MAX_BUBBLES, MAX_POPS, foamFragmentShader } from './foamShader'
import { FoamSim } from './foamSim'

export function Foam({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const { uniforms, update } = useTimerUniforms()
  const aspect = size.width / Math.max(size.height, 1)

  const sim = useMemo(() => new FoamSim(aspect), [aspect])

  const extra = useMemo(
    () => ({
      uBubbles: {
        value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
      uWobble: {
        value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector2(1, 0)),
      },
      uPops: {
        value: Array.from({ length: MAX_POPS }, () => new THREE.Vector4(0, 0, 1, 0)),
      },
      uWall: { value: 0.0105 },
      uGap: { value: 0.017 },
    }),
    [],
  )

  const all = useMemo(() => ({ ...uniforms, ...extra }), [uniforms, extra])

  /** Progress at the last pop, so bursts track the clock rather than the frame. */
  const lastProgress = useRef(1)

  useEffect(() => {
    sim.reset()
    lastProgress.current = 1
  }, [sim])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const t = frame.current
    update(t, dt, size.width, size.height)

    // A reset (or a scrub upward) refills the cluster.
    if (t.progress > lastProgress.current + 0.02 && sim.aliveCount < MAX_BUBBLES) {
      sim.reset()
    }
    lastProgress.current = t.progress

    // Bubbles retire in step with the clock: full cluster at the start, one
    // left at the buzzer.
    const wanted = Math.max(1, Math.round(t.progress * MAX_BUBBLES))
    if (sim.aliveCount > wanted) sim.pop()

    // ...and the survivors close down as well, so the foam shrinks overall.
    sim.step(dt, 0.72 + 0.28 * t.progress)

    for (let i = 0; i < MAX_BUBBLES; i++) {
      const b = sim.bubbles[i]
      extra.uBubbles.value[i].set(b.x, b.y, b.r, b.amp)
      extra.uWobble.value[i].set(Math.cos(b.angle), Math.sin(b.angle))
    }
    for (let i = 0; i < MAX_POPS; i++) {
      const p = sim.pops[i]
      if (p) extra.uPops.value[i].set(p.x, p.y, p.age, p.radius)
      else extra.uPops.value[i].set(0, 0, 1, 0)
    }
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        key={foamFragmentShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={foamFragmentShader}
        uniforms={all}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

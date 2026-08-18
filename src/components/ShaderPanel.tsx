import { memo, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PANEL, STAGE } from '../lib/design'
import { MAX_DURATION_SEC, type TimerFrame } from '../hooks/useTimer'
import { fieldFragmentShader, fieldVertexShader } from '../shaders/field'

const PANEL_WIDTH = STAGE.width - PANEL.width
const FINISH_DECAY_SEC = 2.4

/** Frame-rate independent exponential approach. */
function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

function Field({ frame }: { frame: React.RefObject<TimerFrame> }) {
  const size = useThree((s) => s.size)

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(PANEL_WIDTH, STAGE.height) },
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uUrgency: { value: 0 },
      uRemaining: { value: 0 },
      uRunning: { value: 0 },
      uArmed: { value: 0 },
      uFinish: { value: 0 },
    }),
    [],
  )

  // Smoothed mirrors of the timer so parameter changes ease rather than snap —
  // scrubbing the ring should feel like the field is following your hand.
  const smooth = useRef({ urgency: 0, running: 0, armed: 0 })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const t = frame.current
    const s = smooth.current

    s.urgency = approach(s.urgency, t.urgency, 3.5, dt)
    s.running = approach(s.running, t.running ? 1 : 0, 2.2, dt)
    s.armed = approach(s.armed, t.duration / MAX_DURATION_SEC, 4.0, dt)

    uniforms.uTime.value += dt
    uniforms.uProgress.value = t.progress
    uniforms.uUrgency.value = s.urgency
    uniforms.uRemaining.value = t.remaining
    uniforms.uRunning.value = s.running
    uniforms.uArmed.value = s.armed
    uniforms.uFinish.value = Math.max(0, 1 - t.sinceFinish / FINISH_DECAY_SEC)
    uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        /* Re-keying on the source recompiles the program when the GLSL changes,
           which three would otherwise skip without an explicit needsUpdate. */
        key={fieldFragmentShader}
        vertexShader={fieldVertexShader}
        fragmentShader={fieldFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

/**
 * Right half of the board. Memoised on a stable ref so the per-frame countdown
 * re-renders in the timer panel never touch the WebGL tree.
 */
export const ShaderPanel = memo(function ShaderPanel({
  frame,
}: {
  frame: React.RefObject<TimerFrame>
}) {
  return (
    <div
      className="shader-panel"
      style={{ left: PANEL.width, width: PANEL_WIDTH, height: STAGE.height }}
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        flat
      >
        <Field frame={frame} />
      </Canvas>
    </div>
  )
})

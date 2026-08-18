import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import {
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { gridFragmentShader } from './gridShader'

export function Grid({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { update } = useTimerUniforms()
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useRef(createTimerUniforms()).current

  useFrame((_, delta) => {
    const t = frame.current
    // A deliberate pause stops the animation; merely being armed does not.
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    update(material.current, t, dt, size.width * dpr, size.height * dpr)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        key={gridFragmentShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

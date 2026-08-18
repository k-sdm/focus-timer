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
    update(
      material.current,
      frame.current,
      Math.min(delta, 0.05),
      size.width * dpr,
      size.height * dpr,
    )
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

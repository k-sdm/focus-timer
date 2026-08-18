import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { fullscreenVertexShader, useTimerUniforms, type VisualProps } from './common'
import { windFragmentShader } from './windShader'

export function Wind({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const { uniforms, update } = useTimerUniforms()
  const material = useRef<THREE.ShaderMaterial>(null)

  useFrame((_, delta) => {
    update(material.current, frame.current, Math.min(delta, 0.05), size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        key={windFragmentShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={windFragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

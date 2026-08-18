import { useThree, useFrame } from '@react-three/fiber'
import { fullscreenVertexShader, useTimerUniforms, type VisualProps } from './common'
import { windFragmentShader } from './windShader'

export function Wind({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const { uniforms, update } = useTimerUniforms()

  useFrame((_, delta) => {
    update(frame.current, Math.min(delta, 0.05), size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
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

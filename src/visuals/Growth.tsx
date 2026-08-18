import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { fullscreenVertexShader, useTimerUniforms, type VisualProps } from './common'
import { growthDisplayShader, growthSimShader } from './growthShaders'

/** Simulation grid. Coarse on purpose: it sets the width of the ink line. */
const SIM_HEIGHT = 480
/**
 * Gray-Scott needs thousands of iterations before it reads as structure, so the
 * frontier is advanced hard each frame. The passes are 400x480 — cheap.
 */
const STEPS_PER_FRAME = 30
/**
 * Gray-Scott needs a few thousand iterations before it reads as anything, so a
 * fresh seed is run forward in one burst. Without this the panel spends its
 * first seconds looking broken rather than looking empty.
 */
const PRIME_STEPS = 2600

interface Sim {
  width: number
  height: number
  targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  material: THREE.ShaderMaterial
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  index: number
  seeded: boolean
  dispose: () => void
}

/**
 * RGBA16F is only colour-renderable where the float colour-buffer extension is
 * present. Where it isn't, the framebuffer is silently incomplete and every
 * pass is dropped — a blank white panel with nothing in the console. Fall back
 * to 8-bit and scale the reagent up to use the range that is left.
 */
function pickTargetType(gl: THREE.WebGLRenderer): THREE.TextureDataType {
  const ctx = gl.getContext()
  const renderable =
    ctx.getExtension('EXT_color_buffer_float') ??
    ctx.getExtension('EXT_color_buffer_half_float')
  return renderable ? THREE.HalfFloatType : THREE.UnsignedByteType
}

function createSim(
  width: number,
  height: number,
  aspect: number,
  type: THREE.TextureDataType,
): Sim {
  const options: THREE.RenderTargetOptions = {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  }

  const targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [
    new THREE.WebGLRenderTarget(width, height, options),
    new THREE.WebGLRenderTarget(width, height, options),
  ]

  const material = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertexShader,
    fragmentShader: growthSimShader,
    uniforms: {
      uState: { value: null as THREE.Texture | null },
      uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
      uAspect: { value: aspect },
      uSeed: { value: 1 },
      uFeed: { value: 0.037 },
      uKill: { value: 0.0605 },
      uDt: { value: 1.0 },
      uRadius: { value: 1.6 },
      // 8-bit storage quantises the reagent into uselessness at its natural
      // range, so it is stored scaled and divided back out on read.
      uScale: { value: type === THREE.UnsignedByteType ? 2.6 : 1.0 },
    },
    depthTest: false,
    depthWrite: false,
  })

  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))

  return {
    width,
    height,
    targets,
    material,
    scene,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    index: 0,
    seeded: false,
    dispose() {
      targets.forEach((t) => t.dispose())
      material.dispose()
      geometry.dispose()
    },
  }
}

export function Growth({ frame }: VisualProps) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const { uniforms, update } = useTimerUniforms()

  const aspect = size.width / Math.max(size.height, 1)
  const simW = Math.max(2, Math.round(SIM_HEIGHT * aspect))

  /**
   * Allocated lazily rather than in a memo, and torn down only on a real
   * unmount. StrictMode fires effect cleanups immediately after mount, which
   * would otherwise dispose the render targets the frame loop is about to use.
   */
  const simRef = useRef<Sim | null>(null)
  const getSim = (): Sim => {
    const current = simRef.current
    if (current && current.width === simW) return current
    current?.dispose()
    const next = createSim(simW, SIM_HEIGHT, aspect, pickTargetType(gl))
    simRef.current = next
    return next
  }

  useEffect(
    () => () => {
      simRef.current?.dispose()
      simRef.current = null
    },
    [],
  )

  const display = useMemo(
    () => ({
      ...uniforms,
      uState: { value: null as THREE.Texture | null },
      uScale: { value: 1 },
    }),
    [uniforms],
  )

  const lastProgress = useRef(1)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const t = frame.current
    update(t, dt, size.width, size.height)

    const sim = getSim()
    const prev = gl.getRenderTarget()

    // Reseed on the first frame after allocation, and on a reset.
    const reseeding = !sim.seeded || t.progress > lastProgress.current + 0.02
    if (reseeding) {
      sim.material.uniforms.uSeed.value = 1
      // Detach the previous state first: seeding writes to both targets, and
      // rendering into a texture the material still samples is a feedback loop,
      // which the driver answers by dropping the draw entirely.
      sim.material.uniforms.uState.value = null
      for (const target of sim.targets) {
        gl.setRenderTarget(target)
        gl.render(sim.scene, sim.camera)
      }
      sim.material.uniforms.uSeed.value = 0
      sim.seeded = true
      sim.index = 0
    }
    lastProgress.current = t.progress

    // The fed disc contracts with the clock. It stays oversized while idle so
    // the pattern can fill the panel before anything starts retreating.
    sim.material.uniforms.uRadius.value = 0.06 + uniforms.uProgress.value * 0.78
    // A touch more kill as time runs out: the frontier breaks into dots sooner.
    sim.material.uniforms.uKill.value = 0.0605 + uniforms.uUrgency.value * 0.0022

    const steps = reseeding ? PRIME_STEPS : STEPS_PER_FRAME
    for (let i = 0; i < steps; i++) {
      sim.material.uniforms.uState.value = sim.targets[sim.index].texture
      gl.setRenderTarget(sim.targets[1 - sim.index])
      gl.render(sim.scene, sim.camera)
      sim.index = 1 - sim.index
    }

    gl.setRenderTarget(prev)
    display.uState.value = sim.targets[sim.index].texture
    display.uScale.value = sim.material.uniforms.uScale.value as number
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        key={growthDisplayShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={growthDisplayShader}
        uniforms={display}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

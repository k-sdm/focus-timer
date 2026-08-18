import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { growthDisplayShader, growthSimShader } from './growthShaders'

/** Simulation grid. Coarse on purpose: it sets the width of the ink line. */
const SIM_HEIGHT = 480
/**
 * Gray-Scott needs thousands of iterations before it reads as structure, so the
 * frontier is advanced hard each frame. The passes are 400x480 — cheap.
 */
const STEPS_PER_FRAME = 30
/**
 * Iterations needed to relax a fresh seed into a settled labyrinth. Spread over
 * frames rather than run in one burst: as a single block this is a visible
 * hitch on switching to the visual, and as a per-frame trickle it reads as the
 * pattern resolving into focus.
 */
const PRIME_TOTAL = 6000
const PRIME_PER_FRAME = 240

interface Sim {
  width: number
  height: number
  targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  material: THREE.ShaderMaterial
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  index: number
  seeded: boolean
  /** Relaxation iterations still owed before the pattern is settled. */
  prime: number
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
    prime: 0,
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
  const { update } = useTimerUniforms()

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
      ...createTimerUniforms(),
      uState: { value: null as THREE.Texture | null },
      uScale: { value: 1 },
    }),
    [],
  )
  const material = useRef<THREE.ShaderMaterial>(null)

  const lastProgress = useRef(1)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const t = frame.current
    // Written through the material: three clones the uniforms object it is
    // given, and in particular replaces render-target textures with null, so a
    // uState assigned to the template would never reach the shader.
    const u = update(material.current, t, dt, size.width, size.height)
    if (!u) return

    const sim = getSim()
    const prev = gl.getRenderTarget()

    // The disc is the clock: full at the armed duration, gone at the buzzer.
    // Whatever duration is set, the retraction spans exactly that span.
    sim.material.uniforms.uRadius.value = (u.uProgress.value as number) * 0.84

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
      sim.prime = PRIME_TOTAL
    }
    lastProgress.current = t.progress

    // A touch more kill as time runs out: the frontier breaks into dots sooner.
    // The slow drift on top keeps the labyrinth reorganising once it has filled
    // its disc — Gray-Scott settles into a near-steady state otherwise, and an
    // idle board would simply stop moving.
    const clock = u.uTime.value as number
    sim.material.uniforms.uFeed.value = 0.037 + Math.sin(clock * 0.085) * 0.0016
    sim.material.uniforms.uKill.value =
      0.0605 + (u.uUrgency.value as number) * 0.0022 + Math.cos(clock * 0.062) * 0.0009

    // Finish settling first; after that the reaction only advances while the
    // clock does, so pausing genuinely stops it rather than slowing it down.
    let steps = 0
    if (sim.prime > 0) {
      steps = Math.min(PRIME_PER_FRAME, sim.prime)
      sim.prime -= steps
    } else if (t.running) {
      steps = STEPS_PER_FRAME
    }

    for (let i = 0; i < steps; i++) {
      sim.material.uniforms.uState.value = sim.targets[sim.index].texture
      gl.setRenderTarget(sim.targets[1 - sim.index])
      gl.render(sim.scene, sim.camera)
      sim.index = 1 - sim.index
    }

    gl.setRenderTarget(prev)
    u.uState.value = sim.targets[sim.index].texture
    u.uScale.value = sim.material.uniforms.uScale.value
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
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

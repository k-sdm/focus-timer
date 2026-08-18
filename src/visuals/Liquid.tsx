import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createTimerUniforms,
  fullscreenVertexShader,
  useTimerUniforms,
  type VisualProps,
} from './common'
import { SAND_COLS, SAND_ROWS, sandDisplayShader, sandSimShader } from './liquidShader'

// Lateral flow only travels one cell per step, so levelling needs a few more
// passes than heaping did.
const STEPS_PER_FRAME = 8
const CELLS = SAND_COLS * SAND_ROWS
/** Loose sand never packs to 100%; this is what "full" means here. */
const PACKED = 0.94
/** The inlet is the full width now, two rows deep. */
const INLET_CELLS = SAND_COLS * 2

interface Sim {
  targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  material: THREE.ShaderMaterial
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  index: number
  seeded: boolean
  /** Running estimate of grains laid down, used to meter the inlet. */
  grains: number
  dispose: () => void
}

function createSim(): Sim {
  const options: THREE.RenderTargetOptions = {
    // Binary state, so 8 bits is plenty and there is no float extension to want.
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  }

  const targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [
    new THREE.WebGLRenderTarget(SAND_COLS, SAND_ROWS, options),
    new THREE.WebGLRenderTarget(SAND_COLS, SAND_ROWS, options),
  ]

  const material = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertexShader,
    fragmentShader: sandSimShader,
    uniforms: {
      uState: { value: null as THREE.Texture | null },
      uGrid: { value: new THREE.Vector2(SAND_COLS, SAND_ROWS) },
      uOffset: { value: 0 },
      uSpawn: { value: 0 },
      uTime: { value: 0 },
      uStep: { value: 0 },
      uReset: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  })

  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))

  return {
    targets,
    material,
    scene,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    index: 0,
    seeded: false,
    grains: 0,
    dispose() {
      targets.forEach((t) => t.dispose())
      material.dispose()
      geometry.dispose()
    },
  }
}

export function Liquid({ frame }: VisualProps) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { update } = useTimerUniforms()

  const material = useRef<THREE.ShaderMaterial>(null)
  const display = useMemo(
    () => ({
      ...createTimerUniforms(),
      uState: { value: null as THREE.Texture | null },
      uGrid: { value: new THREE.Vector2(SAND_COLS, SAND_ROWS) },
    }),
    [],
  )

  // Allocated lazily and torn down only on a real unmount: StrictMode fires
  // effect cleanups straight after mount, which would otherwise dispose the
  // targets the frame loop is about to use.
  const simRef = useRef<Sim | null>(null)
  useEffect(
    () => () => {
      simRef.current?.dispose()
      simRef.current = null
    },
    [],
  )

  const lastProgress = useRef(1)

  useFrame((_, delta) => {
    const t = frame.current
    // A deliberate pause stops the animation; merely being armed does not.
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    const u = update(material.current, t, dt, size.width * dpr, size.height * dpr)
    if (!u) return

    if (!simRef.current) simRef.current = createSim()
    const sim = simRef.current
    const prev = gl.getRenderTarget()

    if (!sim.seeded || t.progress > lastProgress.current + 0.02) {
      sim.material.uniforms.uReset.value = 1
      sim.material.uniforms.uState.value = null
      for (const target of sim.targets) {
        gl.setRenderTarget(target)
        gl.render(sim.scene, sim.camera)
      }
      sim.material.uniforms.uReset.value = 0
      sim.seeded = true
      sim.index = 0
      sim.grains = 0
    }
    lastProgress.current = t.progress

    // Meter the inlet off the shortfall rather than a fixed rate, so the grid
    // is full at the buzzer whatever duration was armed. Grains are never
    // removed, so integrating what we ask for tracks what is actually down.
    const target = CELLS * PACKED * (1 - Math.max(0, Math.min(1, t.progress)))
    const shortfall = Math.max(0, target - sim.grains)
    const capacity = INLET_CELLS * STEPS_PER_FRAME
    const spawn = Math.min(1, shortfall / capacity)
    sim.grains = Math.min(CELLS * PACKED, sim.grains + spawn * capacity * 0.85)

    sim.material.uniforms.uSpawn.value = spawn
    sim.material.uniforms.uTime.value = u.uTime.value as number

    // Step count, not dt, drives the automaton, so freezing needs saying twice.
    const steps = t.paused ? 0 : STEPS_PER_FRAME
    for (let i = 0; i < steps; i++) {
      sim.material.uniforms.uState.value = sim.targets[sim.index].texture
      sim.material.uniforms.uOffset.value = i % 2
      // Distinct per step, so the rain is not the same pattern eight times over.
      // Wrapped, because the shader's hash loses all precision on a large input.
      sim.material.uniforms.uStep.value =
        ((sim.material.uniforms.uStep.value as number) + 1) % 4096
      gl.setRenderTarget(sim.targets[1 - sim.index])
      gl.render(sim.scene, sim.camera)
      sim.index = 1 - sim.index
    }

    gl.setRenderTarget(prev)
    u.uState.value = sim.targets[sim.index].texture
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        key={sandDisplayShader}
        vertexShader={fullscreenVertexShader}
        fragmentShader={sandDisplayShader}
        uniforms={display}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

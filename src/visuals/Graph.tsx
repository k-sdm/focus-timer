import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { approach, type VisualProps } from './common'

const NODES = 62
/** Extra edges beyond the spanning tree, which is what makes it a graph. */
const EXTRA_EDGES = 22

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  weight: number
  /** 1 while present, easing to 0 once dropped. */
  life: number
  target: number
}

const graphVertexShader = /* glsl */ `
  attribute float alpha;
  varying float vAlpha;
  uniform float uPointScale;

  void main() {
    vAlpha = alpha;
    gl_PointSize = uPointScale;
    gl_Position = vec4(position.xyz, 1.0);
  }
`

const edgeFragmentShader = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.004) discard;
    gl_FragColor = vec4(0.18, 0.18, 0.20, vAlpha * 0.5);
  }
`

const nodeFragmentShader = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.01) discard;
    // gl_PointCoord is the only way to round off a point sprite.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float aa = fwidth(d) * 1.4;
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    if (disc <= 0.01) discard;
    gl_FragColor = vec4(0.06, 0.06, 0.07, vAlpha * disc);
  }
`

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A force-directed graph that thins out as the clock empties. Built on a
 * spanning tree with extra edges laid over it, so the graph is always connected
 * — a random edge set falls into islands that drift apart under repulsion and
 * stops reading as one structure.
 */
export function Graph({ frame }: VisualProps) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { nodes, edges } = useMemo(() => {
    const rand = mulberry(0x9a17)
    const nodes: Node[] = []
    for (let i = 0; i < NODES; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 0.34
      nodes.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        weight: rand() > 0.82 ? 1.9 : 0.7 + rand() * 0.6,
        life: 1,
        target: 1,
      })
    }

    const edges: [number, number][] = []
    for (let i = 1; i < NODES; i++) edges.push([i, Math.floor(rand() * i)])
    for (let i = 0; i < EXTRA_EDGES; i++) {
      const a = Math.floor(rand() * NODES)
      const b = Math.floor(rand() * NODES)
      if (a !== b) edges.push([a, b])
    }
    return { nodes, edges }
  }, [])

  const geometries = useMemo(() => {
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edges.length * 2 * 3), 3),
    )
    edgeGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(edges.length * 2), 1))

    const nodeGeo = new THREE.BufferGeometry()
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NODES * 3), 3))
    nodeGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(NODES), 1))
    return { edgeGeo, nodeGeo }
  }, [edges.length])

  useEffect(
    () => () => {
      geometries.edgeGeo.dispose()
      geometries.nodeGeo.dispose()
    },
    [geometries],
  )

  const nodeUniforms = useMemo(() => ({ uPointScale: { value: 8 } }), [])
  const edgeUniforms = useMemo(() => ({ uPointScale: { value: 1 } }), [])

  useFrame((_, delta) => {
    const t = frame.current
    const dt = t.paused ? 0 : Math.min(delta, 0.05)
    const aspect = size.width / Math.max(size.height, 1)

    // Nodes drop away in step with the clock, oldest index first.
    const wanted = Math.max(0, Math.round(Math.max(0, Math.min(1, t.progress)) * NODES))
    for (let i = 0; i < NODES; i++) nodes[i].target = i < wanted ? 1 : 0

    const h = Math.min(dt, 1 / 50)
    for (let i = 0; i < NODES; i++) {
      const a = nodes[i]
      a.life = approach(a.life, a.target, 3.0, h)
      if (a.life < 0.01) continue

      // Repulsion keeps the layout open.
      for (let j = i + 1; j < NODES; j++) {
        const b = nodes[j]
        if (b.life < 0.01) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d2 = Math.max(dx * dx + dy * dy, 1e-5)
        const f = Math.min(0.0030 / d2, 4.0) * a.life * b.life
        a.vx += dx * f * h
        a.vy += dy * f * h
        b.vx -= dx * f * h
        b.vy -= dy * f * h
      }

      a.vx -= a.x * 0.42 * h
      a.vy -= a.y * 0.42 * h
    }

    // Springs.
    for (const [i, j] of edges) {
      const a = nodes[i]
      const b = nodes[j]
      const live = a.life * b.life
      if (live < 0.01) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1e-6
      const f = (d - 0.145) * 5.0 * live
      a.vx += (dx / d) * f * h
      a.vy += (dy / d) * f * h
      b.vx -= (dx / d) * f * h
      b.vy -= (dy / d) * f * h
    }

    const damp = Math.exp(-2.1 * h)
    for (const n of nodes) {
      n.vx *= damp
      n.vy *= damp
      n.x += n.vx * h
      n.y += n.vy * h
    }

    const sx = 2 / aspect
    const nodePos = geometries.nodeGeo.getAttribute('position') as THREE.BufferAttribute
    const nodeAlpha = geometries.nodeGeo.getAttribute('alpha') as THREE.BufferAttribute
    const np = nodePos.array as Float32Array
    const na = nodeAlpha.array as Float32Array
    for (let i = 0; i < NODES; i++) {
      np[i * 3] = nodes[i].x * sx
      np[i * 3 + 1] = nodes[i].y * 2
      np[i * 3 + 2] = 0
      na[i] = nodes[i].life
    }
    nodePos.needsUpdate = true
    nodeAlpha.needsUpdate = true

    const edgePos = geometries.edgeGeo.getAttribute('position') as THREE.BufferAttribute
    const edgeAlpha = geometries.edgeGeo.getAttribute('alpha') as THREE.BufferAttribute
    const ep = edgePos.array as Float32Array
    const ea = edgeAlpha.array as Float32Array
    edges.forEach(([i, j], k) => {
      const a = nodes[i]
      const b = nodes[j]
      ep[k * 6] = a.x * sx
      ep[k * 6 + 1] = a.y * 2
      ep[k * 6 + 2] = 0
      ep[k * 6 + 3] = b.x * sx
      ep[k * 6 + 4] = b.y * 2
      ep[k * 6 + 5] = 0
      const live = Math.min(a.life, b.life)
      ea[k * 2] = live
      ea[k * 2 + 1] = live
    })
    edgePos.needsUpdate = true
    edgeAlpha.needsUpdate = true

    nodeUniforms.uPointScale.value = 7.5 * dpr
  })

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={/* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`}
          fragmentShader={/* glsl */ `precision highp float; void main() { gl_FragColor = vec4(1.0); }`}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      <lineSegments frustumCulled={false} geometry={geometries.edgeGeo}>
        <shaderMaterial
          vertexShader={graphVertexShader}
          fragmentShader={edgeFragmentShader}
          uniforms={edgeUniforms}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>

      <points frustumCulled={false} geometry={geometries.nodeGeo}>
        <shaderMaterial
          vertexShader={graphVertexShader}
          fragmentShader={nodeFragmentShader}
          uniforms={nodeUniforms}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </points>
    </>
  )
}

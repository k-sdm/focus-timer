/** 3D value noise, on the CPU: the relief is built as geometry, not per-pixel. */

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const zf = smooth(z - zi)

  let acc = 0
  for (let dz = 0; dz < 2; dz++) {
    const wz = dz ? zf : 1 - zf
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy ? yf : 1 - yf
      for (let dx = 0; dx < 2; dx++) {
        const wx = dx ? xf : 1 - xf
        acc += hash3(xi + dx, yi + dy, zi + dz) * wx * wy * wz
      }
    }
  }
  return acc * 2 - 1
}

export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp
    freq *= 2.03
    amp *= 0.5
  }
  return sum
}

/**
 * Ridged multifractal: `1 - |noise|` creases the field along its zero crossings,
 * which is what turns smooth hills into sharp ridges and peaks. `detail` fades
 * the finer octaves out first, so the terrain erodes — losing its jaggedness
 * before it loses its height — rather than simply being scaled down.
 */
export function ridged3(x: number, y: number, z: number, detail: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let weight = 1
  let norm = 0

  for (let i = 0; i < 4; i++) {
    let n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq))
    n *= n
    n *= weight
    weight = Math.max(0, Math.min(1, n * 2.2))

    const octave = i === 0 ? 1 : Math.pow(detail, 1 + i * 0.55)
    sum += n * amp * octave
    norm += amp
    freq *= 2.05
    amp *= 0.5
  }

  return sum / norm
}

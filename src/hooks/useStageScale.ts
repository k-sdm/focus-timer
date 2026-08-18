import { useEffect, useState } from 'react'
import { STAGE } from '../lib/design'

/**
 * The board is authored at a fixed 2000 x 1200. Rather than making the layout
 * fluid we scale the whole board to fit the viewport and letterbox the rest,
 * which keeps every measured coordinate exact at any window size.
 */
export function useStageScale(): number {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const measure = () => {
      const next = Math.min(
        window.innerWidth / STAGE.width,
        window.innerHeight / STAGE.height,
      )
      setScale(next)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return scale
}

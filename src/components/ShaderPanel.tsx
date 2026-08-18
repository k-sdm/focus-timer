import { memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PANEL, STAGE } from '../lib/design'
import type { TimerFrame } from '../hooks/useTimer'
import { VISUALS } from '../visuals'

const PANEL_WIDTH = STAGE.width - PANEL.width

interface Props {
  frame: React.RefObject<TimerFrame>
  visualId: string
}

/**
 * Right half of the board. Memoised on a stable ref so the per-frame countdown
 * re-renders in the timer panel never touch the WebGL tree.
 */
export const ShaderPanel = memo(function ShaderPanel({ frame, visualId }: Props) {
  const visual = VISUALS.find((v) => v.id === visualId) ?? VISUALS[0]
  const Visual = visual.Component

  return (
    <div
      className="shader-panel"
      style={{ left: PANEL.width, width: PANEL_WIDTH, height: STAGE.height }}
      aria-hidden="true"
    >
      <Canvas
        // Capped rather than uncapped: the foam evaluates every bubble per
        // pixel, and there is nothing here that rewards a 4x backing store.
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        flat
      >
        {/* Remounting on id is deliberate — each visual owns its own sim state. */}
        <Visual key={visual.id} frame={frame} />
      </Canvas>
    </div>
  )
})

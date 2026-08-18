import { memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { PANEL, STAGE, WINDOW } from '../lib/design'
import type { TimerFrame } from '../hooks/useTimer'
import { VISUALS } from '../visuals'
import { MenuBar } from './MenuBar'

const SCREEN_WIDTH = STAGE.width - PANEL.width

interface Props {
  frame: React.RefObject<TimerFrame>
  visualId: string
  /** 0 = smallest window, 1 = full screen. */
  windowSize: number
}

/**
 * The right half is a screen: a menu bar across the top and a window holding
 * the visual. The window keeps the screen's 5:6 ratio at every size, so the
 * aspect the visuals are composed for never changes and nothing has to be
 * rebuilt while the slider is moving.
 */
export const ShaderPanel = memo(function ShaderPanel({ frame, visualId, windowSize }: Props) {
  const visual = VISUALS.find((v) => v.id === visualId) ?? VISUALS[0]
  const Visual = visual.Component

  const scale = WINDOW.minScale + (1 - WINDOW.minScale) * windowSize
  const width = Math.round(SCREEN_WIDTH * scale)
  const height = Math.round(STAGE.height * scale)
  // Chrome earns its keep only once the window has pulled off the edges.
  const framed = 1 - windowSize

  return (
    <div
      className="screen"
      style={{ left: PANEL.width, width: SCREEN_WIDTH, height: STAGE.height }}
    >
      <div
        className="screen__window"
        style={{
          width,
          height,
          borderRadius: WINDOW.cornerRadius * framed,
          boxShadow: `0 ${18 * framed}px ${52 * framed}px rgba(0, 0, 0, ${0.14 * framed})`,
        }}
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

      <MenuBar />
    </div>
  )
})

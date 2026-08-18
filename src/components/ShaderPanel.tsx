import { memo, useCallback, useRef, useState } from 'react'
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
  const fullscreen = windowSize > 0.999

  // Offset from centre, in board pixels. Clamped on read rather than on write,
  // so growing the window pulls it back onto the screen instead of stranding it.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  const slackX = Math.max(0, (SCREEN_WIDTH - width) / 2)
  const slackY = Math.max(0, (STAGE.height - height) / 2)
  const x = Math.min(slackX, Math.max(-slackX, offset.x))
  const y = Math.min(slackY, Math.max(-slackY, offset.y))

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (fullscreen) return
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        originX: x,
        originY: y,
      }
    },
    [fullscreen, x, y],
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    // The board is uniformly scaled to fit, so pointer travel has to be divided
    // back through that scale to stay under the cursor.
    const board = e.currentTarget.getBoundingClientRect()
    const boardScale = board.width / (e.currentTarget.offsetWidth || 1)
    setOffset({
      x: d.originX + (e.clientX - d.startX) / boardScale,
      y: d.originY + (e.clientY - d.startY) / boardScale,
    })
  }, [])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    drag.current.active = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div
      className="screen"
      style={{ left: PANEL.width, width: SCREEN_WIDTH, height: STAGE.height }}
    >
      <div
        className={`screen__window${fullscreen ? ' is-fullscreen' : ''}`}
        style={{
          width,
          height,
          transform: `translate(${x}px, ${y}px)`,
          borderRadius: fullscreen ? 0 : WINDOW.cornerRadius,
          boxShadow: fullscreen ? 'none' : '0 16px 44px rgba(0, 0, 0, 0.16)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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

import { useCallback, useRef, useState } from 'react'
import { SLIDER } from '../lib/design'

/**
 * Presentational only. The comp calls for a slider under the ring but it has no
 * assigned behaviour yet, so the handle tracks the pointer and nothing else.
 * Wire `onChange` up here when the control gets a job.
 */
export function DurationSlider() {
  const [value, setValue] = useState<number>(SLIDER.initialValue)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const travel = SLIDER.width - SLIDER.knob

  const valueAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return value
      const box = el.getBoundingClientRect()
      const half = (SLIDER.knob / 2 / SLIDER.width) * box.width
      const usable = box.width - half * 2
      if (usable <= 0) return value
      return Math.min(1, Math.max(0, (clientX - box.left - half) / usable))
    },
    [value],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      setValue(valueAt(e.clientX))
    },
    [valueAt],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      setValue(valueAt(e.clientX))
    },
    [valueAt],
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div
      ref={trackRef}
      className="slider"
      style={{
        left: SLIDER.x,
        top: SLIDER.y,
        width: SLIDER.width,
        height: SLIDER.height,
        borderRadius: SLIDER.height / 2,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="slider__knob"
        style={{
          width: SLIDER.knob,
          height: SLIDER.knob,
          transform: `translateX(${value * travel}px)`,
        }}
      />
    </div>
  )
}

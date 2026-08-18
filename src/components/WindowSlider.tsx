import { useCallback, useRef } from 'react'
import { SLIDER } from '../lib/design'

interface Props {
  /** 0 = smallest window, 1 = the visual fills the screen. */
  value: number
  onChange: (value: number) => void
}

/** Sets how large a window the visual occupies on the right-hand screen. */
export function WindowSlider({ value, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const travel = SLIDER.width - SLIDER.knob

  const valueAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return value
      const box = el.getBoundingClientRect()
      // The knob's own width is dead travel at each end.
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
      onChange(valueAt(e.clientX))
    },
    [valueAt, onChange],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      onChange(valueAt(e.clientX))
    },
    [valueAt, onChange],
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
      role="slider"
      aria-label="Window size"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
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

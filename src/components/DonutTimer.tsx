import { useCallback, useRef } from 'react'
import { DONUT, COLORS } from '../lib/design'
import { TAU, angleFrom, arcPath, shortestDelta } from '../lib/arc'
import { MAX_DURATION_SEC } from '../hooks/useTimer'

interface Props {
  /** Seconds currently shown by the ring. */
  remaining: number
  onScrubStart: () => void
  /** Total offset in seconds since the drag began, not an absolute time. */
  onScrub: (offsetSeconds: number) => void
}

const SIZE = DONUT.outerRadius * 2
const C = DONUT.outerRadius // centre in local SVG coordinates

export function DonutTimer({ remaining, onScrubStart, onScrub }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef({ active: false, lastAngle: 0, accum: 0 })

  const angleAt = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return 0
    const box = el.getBoundingClientRect()
    // Angles are scale-invariant, so the board's transform needs no undoing.
    return angleFrom(
      box.left + box.width / 2,
      box.top + box.height / 2,
      clientX,
      clientY,
    )
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { active: true, lastAngle: angleAt(e.clientX, e.clientY), accum: 0 }
      onScrubStart()
    },
    [angleAt, onScrubStart],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d.active) return
      const angle = angleAt(e.clientX, e.clientY)
      // Accumulating deltas rather than reading the absolute angle means the
      // value can't wrap from 30:00 back to 00:00 as the pointer crosses noon.
      d.accum += shortestDelta(angle - d.lastAngle)
      d.lastAngle = angle
      // Reported as an offset, so the caller can apply it against a live clock.
      onScrub((d.accum / TAU) * MAX_DURATION_SEC)
    },
    [angleAt, onScrub],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return
    drag.current.active = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  const fraction = Math.min(1, Math.max(0, remaining / MAX_DURATION_SEC))
  const sweep = fraction * TAU
  const path = arcPath(C, C, DONUT.radius, sweep)
  const isFull = fraction >= 0.9999

  return (
    <svg
      ref={svgRef}
      className="donut"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{
        left: DONUT.cx - DONUT.outerRadius,
        top: DONUT.cy - DONUT.outerRadius,
        cursor: 'grab',
      }}
      role="slider"
      aria-label="Focus duration"
      aria-valuemin={0}
      aria-valuemax={MAX_DURATION_SEC}
      aria-valuenow={Math.round(remaining)}
      aria-valuetext={`${Math.round(remaining / 60)} minutes`}
    >
      <circle
        cx={C}
        cy={C}
        r={DONUT.radius}
        fill="none"
        stroke={COLORS.muted}
        strokeWidth={DONUT.thickness}
      />

      {isFull ? (
        <circle
          cx={C}
          cy={C}
          r={DONUT.radius}
          fill="none"
          stroke={COLORS.white}
          strokeWidth={DONUT.thickness}
        />
      ) : (
        path && (
          <path
            d={path}
            fill="none"
            stroke={COLORS.white}
            strokeWidth={DONUT.thickness}
            strokeLinecap="round"
          />
        )
      )}

      {/* Generous invisible hit ring so the handle is easy to grab. */}
      <circle
        cx={C}
        cy={C}
        r={DONUT.radius}
        fill="none"
        stroke="transparent"
        strokeWidth={DONUT.thickness + 40}
        style={{ pointerEvents: 'stroke' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </svg>
  )
}

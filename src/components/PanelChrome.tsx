import { COLORS } from '../lib/design'

/**
 * The fixed marks that flank the slider in the comp, traced straight from
 * design/TIMER.svg so they land on the same subpixels.
 */
export function PanelChrome() {
  return (
    <svg className="chrome" width={1000} height={1200} viewBox="0 0 1000 1200" aria-hidden="true">
      <g stroke={COLORS.muted} strokeWidth={2}>
        <rect x={174.75} y={805} width={24.75} height={21.375} rx={2} fill="none" />
        <rect x={188.25} y={818.5} width={15.75} height={13.5} rx={2} fill={COLORS.muted} stroke="none" />

        <rect x={788} y={803} width={26.5833} height={22.9583} rx={2} fill={COLORS.muted} />
        <rect x={803.708} y={817.5} width={16.9167} height={14.5} rx={2} fill="none" />

        <rect x={551} y={819} width={9} height={10} rx={2} fill="none" />
      </g>
    </svg>
  )
}

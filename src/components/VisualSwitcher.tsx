import { PANEL, STAGE } from '../lib/design'
import { VISUALS } from '../visuals'

interface Props {
  value: string
  onChange: (id: string) => void
}

/**
 * Sits quietly in the corner of the paper panel. Not part of the original comp —
 * delete this component and the state in App if the board should ship with one
 * fixed visual.
 */
export function VisualSwitcher({ value, onChange }: Props) {
  return (
    <div
      className="switcher"
      style={{ left: PANEL.width + 56, top: STAGE.height - 96 }}
      role="radiogroup"
      aria-label="Visualisation"
    >
      {VISUALS.map((visual, i) => (
        <button
          key={visual.id}
          type="button"
          role="radio"
          aria-checked={value === visual.id}
          className={`switcher__item${value === visual.id ? ' is-active' : ''}`}
          onClick={() => onChange(visual.id)}
        >
          <span className="switcher__index">{i + 1}</span>
          {visual.name}
        </button>
      ))}
    </div>
  )
}

import { PANEL, STAGE } from '../lib/design'
import { VISUALS } from '../visuals'

export const RANDOM_MODE = 'random'

interface Props {
  open: boolean
  onToggle: () => void
  /** Either RANDOM_MODE or a pinned visual id. */
  mode: string
  onMode: (mode: string) => void
  /** What is on screen right now, which differs from mode while random. */
  activeId: string
}

/**
 * Development affordance, not part of the design. The toggle is an unmarked hit
 * area in the corner of the screen so nothing shows on the board until it is
 * asked for.
 */
export function DebugMenu({ open, onToggle, mode, onMode, activeId }: Props) {
  const options = [
    { id: RANDOM_MODE, name: 'Random' },
    ...VISUALS.map((v) => ({ id: v.id, name: v.name })),
  ]

  return (
    <>
      <button
        type="button"
        className="debug__corner"
        style={{ left: STAGE.width - 130, top: 0 }}
        onClick={onToggle}
        aria-label="Toggle debug menu"
        aria-expanded={open}
      />

      {open && (
        <div
          className="debug"
          style={{ left: PANEL.width + 40, top: 140, width: 250 }}
          role="radiogroup"
          aria-label="Visualisation"
        >
          {options.map((option, i) => {
            const selected = mode === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`debug__item${selected ? ' is-selected' : ''}`}
                onClick={() => onMode(option.id)}
              >
                <span className="debug__key">{i === 0 ? 'R' : i}</span>
                {option.name}
                {option.id === RANDOM_MODE && selected && (
                  <span className="debug__now">{activeId}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

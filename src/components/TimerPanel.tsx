import {
  BUTTON,
  CONTENT_BOX_WIDTH,
  RESET_BUTTON_Y,
  TYPE,
  baselineTop,
} from '../lib/design'
import { formatClock, type Timer } from '../hooks/useTimer'
import { DonutTimer } from './DonutTimer'
import { WindowSlider } from './WindowSlider'
import { PanelChrome } from './PanelChrome'

const ACTION_LABEL: Record<Timer['status'], string> = {
  idle: 'Start',
  running: 'Pause',
  paused: 'Resume',
  done: 'Start',
}

const TITLE: Record<Timer['status'], string> = {
  idle: 'Set your focus timer',
  running: 'Stay with it',
  paused: 'Paused',
  done: 'Time',
}

interface Props {
  timer: Timer
  windowSize: number
  onWindowSize: (value: number) => void
  /** Fired when the board is cleared down, which deals a new visual. */
  onReset: () => void
}

export function TimerPanel({ timer, windowSize, onWindowSize, onReset }: Props) {
  const editable = timer.status !== 'running'
  const labelTop = baselineTop(TYPE.button.baseline, TYPE.button.size)

  const handleReset = () => {
    timer.reset()
    onReset()
  }

  return (
    <section className="panel" aria-label="Focus timer">
      <PanelChrome />

      <h1
        className="panel__title"
        style={{
          width: CONTENT_BOX_WIDTH,
          top: baselineTop(TYPE.title.baseline, TYPE.title.size),
          fontSize: TYPE.title.size,
          fontWeight: TYPE.title.weight,
        }}
      >
        {TITLE[timer.status]}
      </h1>

      <DonutTimer remaining={timer.remaining} editable={editable} onScrub={timer.setDuration} />

      <div
        className="panel__readout"
        style={{
          width: CONTENT_BOX_WIDTH,
          top: baselineTop(TYPE.readout.baseline, TYPE.readout.size),
          fontSize: TYPE.readout.size,
          fontWeight: TYPE.readout.weight,
        }}
        aria-live="off"
      >
        {formatClock(timer.remaining)}
      </div>

      <div
        className="panel__label"
        style={{
          width: CONTENT_BOX_WIDTH,
          top: baselineTop(TYPE.label.baseline, TYPE.label.size),
          fontSize: TYPE.label.size,
          fontWeight: TYPE.label.weight,
        }}
      >
        Duration
      </div>

      <WindowSlider value={windowSize} onChange={onWindowSize} />

      <button
        type="button"
        className={`panel__action${timer.status === 'running' ? ' is-running' : ''}`}
        onClick={timer.toggle}
        style={{
          left: BUTTON.x,
          top: BUTTON.y,
          width: BUTTON.width,
          height: BUTTON.height,
          borderRadius: BUTTON.radius,
        }}
      >
        <span style={{ top: labelTop, fontSize: TYPE.button.size, fontWeight: TYPE.button.weight }}>
          {ACTION_LABEL[timer.status]}
        </span>
      </button>

      <button
        type="button"
        className="panel__action"
        onClick={handleReset}
        style={{
          left: BUTTON.x,
          top: RESET_BUTTON_Y,
          width: BUTTON.width,
          height: BUTTON.height,
          borderRadius: BUTTON.radius,
        }}
      >
        <span style={{ top: labelTop, fontSize: TYPE.button.size, fontWeight: TYPE.button.weight }}>
          Reset
        </span>
      </button>
    </section>
  )
}

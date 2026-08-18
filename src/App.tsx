import { useCallback, useEffect, useState } from 'react'
import { SLIDER, STAGE } from './lib/design'
import { useTimer } from './hooks/useTimer'
import { useStageScale } from './hooks/useStageScale'
import { TimerPanel } from './components/TimerPanel'
import { ShaderPanel } from './components/ShaderPanel'
import { DebugMenu, RANDOM_MODE } from './components/DebugMenu'
import { VISUALS } from './visuals'

function pickOther(current: string): string {
  const others = VISUALS.filter((v) => v.id !== current)
  if (others.length === 0) return current
  return others[Math.floor(Math.random() * others.length)].id
}

export default function App() {
  const timer = useTimer(8 * 60)
  const scale = useStageScale()
  const [windowSize, setWindowSize] = useState<number>(SLIDER.initialValue)
  const [debugOpen, setDebugOpen] = useState(false)

  // `mode` is what the board has been told to do; `visualId` is what is on
  // screen. They only differ while random is running the show.
  const [mode, setMode] = useState<string>(RANDOM_MODE)
  const [visualId, setVisualId] = useState(() => pickOther(''))

  const { toggle } = timer

  /**
   * Clearing the board deals a different visual — never the one already up.
   * Deliberately not tied to duration changes: adding time to a paused session
   * should leave the visual you are working against alone.
   */
  const onReset = useCallback(() => {
    if (mode !== RANDOM_MODE) return
    setVisualId(pickOther)
  }, [mode])

  const chooseMode = useCallback((next: string) => {
    setMode(next)
    if (next === RANDOM_MODE) setVisualId(pickOther)
    else setVisualId(next)
  }, [])

  // Space starts and stops; R and 1-6 drive the same choices as the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'BUTTON') return

      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        chooseMode(RANDOM_MODE)
        return
      }

      const index = Number(e.key) - 1
      if (Number.isInteger(index) && index >= 0 && index < VISUALS.length) {
        chooseMode(VISUALS[index].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, chooseMode])

  return (
    <div className="stage-viewport">
      <div
        className="stage"
        style={
          {
            width: STAGE.width,
            height: STAGE.height,
            '--stage-scale': scale,
          } as React.CSSProperties
        }
      >
        <ShaderPanel frame={timer.frame} visualId={visualId} windowSize={windowSize} />
        <TimerPanel
          timer={timer}
          windowSize={windowSize}
          onWindowSize={setWindowSize}
          onReset={onReset}
        />
        <DebugMenu
          open={debugOpen}
          onToggle={() => setDebugOpen((v) => !v)}
          mode={mode}
          onMode={chooseMode}
          activeId={visualId}
        />
      </div>
    </div>
  )
}

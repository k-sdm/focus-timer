import { useEffect, useState } from 'react'
import { STAGE } from './lib/design'
import { useTimer } from './hooks/useTimer'
import { useStageScale } from './hooks/useStageScale'
import { TimerPanel } from './components/TimerPanel'
import { ShaderPanel } from './components/ShaderPanel'
import { VisualSwitcher } from './components/VisualSwitcher'
import { VISUALS } from './visuals'

export default function App() {
  const timer = useTimer(8 * 60)
  const scale = useStageScale()
  const [visualId, setVisualId] = useState(VISUALS[0].id)
  const { toggle } = timer

  // Space starts and stops; 1-3 pick a visual.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'BUTTON') return

      if (e.code === 'Space') {
        e.preventDefault()
        toggle()
        return
      }

      const index = Number(e.key) - 1
      if (Number.isInteger(index) && index >= 0 && index < VISUALS.length) {
        setVisualId(VISUALS[index].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

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
        <ShaderPanel frame={timer.frame} visualId={visualId} />
        <VisualSwitcher value={visualId} onChange={setVisualId} />
        <TimerPanel timer={timer} />
      </div>
    </div>
  )
}

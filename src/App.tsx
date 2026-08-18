import { useEffect } from 'react'
import { STAGE } from './lib/design'
import { useTimer } from './hooks/useTimer'
import { useStageScale } from './hooks/useStageScale'
import { TimerPanel } from './components/TimerPanel'
import { ShaderPanel } from './components/ShaderPanel'

export default function App() {
  const timer = useTimer(8 * 60)
  const scale = useStageScale()
  const { toggle } = timer

  // Space is the one keyboard affordance worth having on a wall-mounted board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'BUTTON') return
      e.preventDefault()
      toggle()
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
        <ShaderPanel frame={timer.frame} />
        <TimerPanel timer={timer} />
      </div>
    </div>
  )
}

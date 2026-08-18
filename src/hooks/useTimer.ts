import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_DURATION_SEC = 30 * 60
export const MIN_DURATION_SEC = 10
/** Dragging the ring snaps to ten-second steps. */
export const DURATION_STEP_SEC = 10

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

/**
 * Mutable, frame-accurate view of the timer. The shader reads this directly in
 * its render loop so it never has to wait on a React commit.
 */
export interface TimerFrame {
  /** Fractional seconds left. */
  remaining: number
  /** Duration the current run was armed with. */
  duration: number
  /** 1 when full, 0 at the buzzer. */
  progress: number
  /** `1 - progress`, i.e. how close the buzzer is. */
  urgency: number
  running: boolean
  /**
   * Deliberately stopped, as opposed to merely not started. Visuals freeze on
   * this; an armed board that has not been started yet still animates.
   */
  paused: boolean
  /** Seconds since the timer last hit zero; large when it never has. */
  sinceFinish: number
}

export interface Timer {
  status: TimerStatus
  /** Armed duration in seconds. */
  duration: number
  /** Fractional seconds left; re-rendered every frame while running. */
  remaining: number
  progress: number
  frame: React.RefObject<TimerFrame>
  setDuration: (seconds: number) => void
  start: () => void
  pause: () => void
  reset: () => void
  toggle: () => void
}

export function clampDuration(seconds: number): number {
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, seconds))
}

export function snapDuration(seconds: number): number {
  return clampDuration(Math.round(seconds / DURATION_STEP_SEC) * DURATION_STEP_SEC)
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds - 1e-6))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const NEVER_FINISHED = 1e6

export function useTimer(initialSeconds = 8 * 60): Timer {
  const [duration, setDurationState] = useState(() => clampDuration(initialSeconds))
  const [remaining, setRemaining] = useState(duration)
  const [status, setStatus] = useState<TimerStatus>('idle')

  const frame = useRef<TimerFrame>({
    remaining: duration,
    duration,
    progress: 1,
    urgency: 0,
    running: false,
    paused: false,
    sinceFinish: NEVER_FINISHED,
  })

  /** performance.now() at which the current run reaches zero. */
  const deadline = useRef(0)
  const finishedAt = useRef(Number.NEGATIVE_INFINITY)
  const rafId = useRef(0)

  const publish = useCallback(
    (left: number, total: number, running: boolean, paused = false) => {
      const f = frame.current
      f.remaining = left
      f.duration = total
      f.progress = total > 0 ? left / total : 0
      f.urgency = 1 - f.progress
      f.running = running
      f.paused = paused
      f.sinceFinish = Number.isFinite(finishedAt.current)
        ? (performance.now() - finishedAt.current) / 1000
        : NEVER_FINISHED
    },
    [],
  )

  // Idle bookkeeping: whenever the armed duration changes outside a run, the
  // remaining time tracks it so the ring and the readout stay in sync.
  const setDuration = useCallback(
    (seconds: number) => {
      const next = clampDuration(seconds)
      setDurationState(next)
      setRemaining(next)
      setStatus((s) => (s === 'running' ? s : 'idle'))
      finishedAt.current = Number.NEGATIVE_INFINITY
      publish(next, next, false)
    },
    [publish],
  )

  const start = useCallback(() => {
    setStatus((s) => {
      if (s === 'running') return s
      const left = s === 'done' ? duration : remaining
      if (left <= 0) return s
      deadline.current = performance.now() + left * 1000
      finishedAt.current = Number.NEGATIVE_INFINITY
      return 'running'
    })
  }, [duration, remaining])

  const pause = useCallback(() => {
    setStatus((s) => (s === 'running' ? 'paused' : s))
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setRemaining(duration)
    finishedAt.current = Number.NEGATIVE_INFINITY
    publish(duration, duration, false)
  }, [duration, publish])

  // Purely start/stop now; clearing down is the reset button's job. `start`
  // already rewinds a finished run, so pressing it again just goes round again.
  const toggle = useCallback(() => {
    if (status === 'running') pause()
    else start()
  }, [status, pause, start])

  // The countdown itself. Driven off a deadline rather than accumulated deltas
  // so a stalled tab or a dropped frame can't make the clock drift.
  useEffect(() => {
    if (status !== 'running') {
      publish(remaining, duration, false, status === 'paused')
      return
    }

    const tick = () => {
      const left = Math.max(0, (deadline.current - performance.now()) / 1000)
      publish(left, duration, true)
      setRemaining(left)
      if (left <= 0) {
        finishedAt.current = performance.now()
        publish(0, duration, false)
        setStatus('done')
        return
      }
      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
    // `remaining` is intentionally not a dependency: it changes every frame and
    // re-subscribing would restart the loop. The deadline already captures it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, duration, publish])

  // Pausing has to bank the time that was left when the pause happened.
  useEffect(() => {
    if (status === 'paused') publish(remaining, duration, false, true)
  }, [status, remaining, duration, publish])

  return {
    status,
    duration,
    remaining,
    progress: duration > 0 ? remaining / duration : 0,
    frame,
    setDuration,
    start,
    pause,
    reset,
    toggle,
  }
}

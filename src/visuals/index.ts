import type { ComponentType } from 'react'
import type { VisualProps } from './common'
import { Foam } from './Foam'
import { Growth } from './Growth'
import { Wind } from './Wind'

export interface Visual {
  id: string
  /** Shown in the switcher. */
  name: string
  Component: ComponentType<VisualProps>
}

export const VISUALS: Visual[] = [
  { id: 'foam', name: 'Foam', Component: Foam },
  { id: 'growth', name: 'Growth', Component: Growth },
  { id: 'wind', name: 'Wind', Component: Wind },
]

export type { VisualProps }

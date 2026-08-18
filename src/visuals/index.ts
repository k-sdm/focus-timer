import type { ComponentType } from 'react'
import type { VisualProps } from './common'
import { Foam } from './Foam'
import { Growth } from './Growth'
import { Wind } from './Wind'
import { Liquid } from './Liquid'
import { Relief } from './Relief'
import { Grid } from './Grid'

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
  { id: 'liquid', name: 'Liquid', Component: Liquid },
  { id: 'relief', name: 'Relief', Component: Relief },
  { id: 'grid', name: 'Grid', Component: Grid },
]

export type { VisualProps }

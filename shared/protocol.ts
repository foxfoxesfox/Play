import type { Action, Settings, View } from './poker'

export type ClientMsg =
  | { t: 'hello'; id: string }
  | { t: 'sit'; name: string; seat?: number }
  | { t: 'act'; action: Action }
  | { t: 'leave' }
  | { t: 'start' }
  | { t: 'pause' }
  | { t: 'settings'; settings: Settings }
  | { t: 'kick'; seat: number }

export type ServerMsg =
  | { t: 'state'; view: View; deadline: number; now: number; autoDeal: boolean }
  | { t: 'error'; message: string }

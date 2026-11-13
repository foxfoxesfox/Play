import { useEffect, useRef } from 'react'
import type { View } from '../shared/poker'
import type { ClientMsg } from '../shared/protocol'

export type Send = (m: ClientMsg) => void
export type Pt = { x: number; y: number }

export const fmt = (n: number) => n.toLocaleString()

export const usePrev = <T,>(v: T) => {
  const r = useRef(v)
  useEffect(() => { r.current = v })
  return r.current
}

/** Dealing order: one card at a time, starting left of the button. */
export const dealOrder = (v: View, k: number, cardIdx: number) =>
  cardIdx * 16 + ((k - v.button - 1 + 2 * v.seats.length) % v.seats.length)

/** Cards were turned face up at this showdown (not a fold-win). */
export const revealed = (v: View) => v.phase === 'showdown' && v.winners.some(w => w.cards.length > 0)

/** At a revealed showdown, the five winning cards lift and the rest dim. */
export function showdownMark(v: View, c: string | null) {
  if (!c || !revealed(v)) return ''
  return v.winners.some(w => w.cards.includes(c)) ? ' card--win' : ' card--lose'
}

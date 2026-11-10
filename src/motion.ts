import { animate, spring, stagger, type JSAnimation } from 'animejs'

export const reduced = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// one place for the table's motion vocabulary
export const EASE_OUT = 'out(4)'
export const EASE_EXIT = 'out(2)'
const d = (ms: number) => (reduced() ? 0 : ms)

/** Cards fly in from the dealer spot (centre of the table) and settle into place. */
export function dealIn(els: Element[], from: { x: number; y: number }, delay = 0) {
  els.forEach((el, i) => {
    const c = centre(el)
    animate(el, {
      x: { from: from.x - c.x, to: 0 },
      y: { from: from.y - c.y, to: 0 },
      rotate: { from: -18 },
      scale: { from: 0.6 },
      opacity: { from: 0 },
      duration: d(520),
      delay: d(delay + i * 70),
      ease: EASE_OUT,
    })
  })
}

/** Board card turn-over. */
export function flipIn(els: Element[], delay = 0) {
  if (!els.length) return
  return animate(els, {
    rotateY: { from: 90 },
    y: { from: -14 },
    opacity: { from: 0 },
    duration: d(420),
    delay: reduced() ? 0 : stagger(90, { start: delay }),
    ease: EASE_OUT,
  })
}

/** The NOW ticket pops on — a named overshoot case (badge pop). */
export function popIn(el: Element | null) {
  if (!el) return
  return animate(el, { scale: { from: 0.7 }, rotate: { from: -6 }, duration: d(500), ease: reduced() ? 'linear' : spring({ bounce: 0.35, duration: 500 }) })
}

/** Chips slide from a seat toward the pot / from the pot to a winner. */
export function slide(el: Element | null, from: { x: number; y: number }) {
  if (!el) return
  const c = centre(el)
  return animate(el, { x: { from: from.x - c.x, to: 0 }, y: { from: from.y - c.y, to: 0 }, opacity: { from: 0.2 }, duration: d(480), ease: EASE_OUT })
}

/** Tween a number displayed in `el` from its previous value. */
export function countTo(el: HTMLElement | null, from: number, to: number): JSAnimation | undefined {
  if (!el || from === to) { if (el) el.textContent = to.toLocaleString(); return }
  const o = { v: from }
  return animate(o, {
    v: to,
    duration: d(600),
    ease: EASE_OUT,
    onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString() },
  })
}

/** Small shake for an error. */
export function shake(el: Element | null) {
  if (!el || reduced()) return
  return animate(el, { x: [0, -6, 5, -3, 0], duration: 360, ease: 'inOut(2)' })
}

/** Rise-and-fade for "+340" winnings. */
export function floatUp(el: Element | null) {
  if (!el) return
  return animate(el, { y: { from: 10, to: -24 }, opacity: [{ to: 1, duration: d(200) }, { to: 0, delay: d(900), duration: d(500) }], duration: d(1600), ease: EASE_OUT })
}

export function centre(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

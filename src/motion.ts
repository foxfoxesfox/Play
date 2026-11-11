import { animate, spring, stagger, type JSAnimation } from 'animejs'
import { sfx, type Sfx } from './sound'

export const reduced = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// one place for the table's motion vocabulary
export const EASE_OUT = 'out(4)'
export const SHUFFLE_MS = 760
export const DEAL_GAP = 75
const d = (ms: number) => (reduced() ? 0 : ms)
type Pt = { x: number; y: number }

/** A landed card drops its finished transform: a leftover 3D transform keeps it on a
 *  compositor layer rasterised mid-flight, which is what made board cards look blurry. */
function land(el: Element) {
  const h = el as HTMLElement
  h.style.transform = ''
  h.style.opacity = ''
}

/** Safety net: a dealt card must never stay hidden, whatever happened to its animation. */
function settle(el: Element, at: number) {
  setTimeout(() => {
    const h = el as HTMLElement
    if (getComputedStyle(h).opacity !== '1' || /rotateY\((?!0deg)/.test(h.style.transform)) { h.style.opacity = ''; h.style.transform = '' }
  }, at)
}

/** Cards fly off the deck one at a time, in the order given (round the table from the button). */
export function dealIn(els: Element[], from: Pt, delay = 0, onEach?: () => void) {
  els.forEach((el, i) => {
    const c = centre(el)
    settle(el, d(delay + i * DEAL_GAP) + 1500)
    animate(el, {
      x: { from: from.x - c.x, to: 0 },
      y: { from: from.y - c.y, to: 0 },
      rotate: { from: -24, to: 0 },
      scale: { from: 0.5, to: 1 },
      opacity: [{ from: 0, to: 1, duration: d(80) }],
      duration: d(480),
      delay: d(delay + i * DEAL_GAP),
      ease: EASE_OUT,
      onBegin: () => { sfx('deal'); onEach?.() },
      onComplete: () => land(el),
    })
  })
}

/** The dealer riffles the deck: halves split, lift, and fall back together twice. */
export function riffle(left: Element | null, right: Element | null) {
  if (!left || !right) return
  sfx('shuffle')
  if (reduced()) return
  animate(left, { x: [0, -16, 0, -16, 0], y: [0, -6, 0, -6, 0], rotate: [0, -10, 0, -10, 0], duration: SHUFFLE_MS, ease: 'inOut(2)' })
  animate(right, { x: [0, 16, 0, 16, 0], y: [0, -6, 0, -6, 0], rotate: [0, 10, 0, 10, 0], duration: SHUFFLE_MS, ease: 'inOut(2)' })
}

/** Board cards slide off the deck and turn face up. */
export function dealBoard(els: Element[], from: Pt, delay = 0) {
  els.forEach((el, i) => {
    const c = centre(el)
    settle(el, d(delay + i * 110) + 1500)
    // one continuous slide-and-turn: never parked edge-on (invisible) between steps
    animate(el, {
      x: { from: from.x - c.x, to: 0 },
      y: { from: from.y - c.y, to: 0 },
      rotateY: { from: 90, to: 0 },
      opacity: { from: 0, to: 1 },
      duration: d(560),
      delay: d(delay + i * 110),
      ease: EASE_OUT,
      onBegin: () => sfx('flip'),
      onComplete: () => land(el),
    })
  })
}

/** A throwaway element: burn cards and chip stacks that travel and vanish. */
function ghost(stage: HTMLElement, html: string, className: string, at: Pt) {
  const r = stage.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = className
  el.innerHTML = html
  el.style.left = `${at.x - r.left}px`
  el.style.top = `${at.y - r.top}px`
  el.setAttribute('aria-hidden', 'true')
  stage.appendChild(el)
  return el
}

/** Burn card: off the top of the deck, onto the muck. */
export function burn(stage: HTMLElement | null, deck: Element | null, delay = 0) {
  if (!stage || !deck || reduced()) return
  const src = deck.querySelector('.card')
  if (!src) return
  const el = ghost(stage, src.outerHTML, 'ghost ghost--card', centre(deck))
  animate(el, {
    onBegin: () => sfx('deal', 0.6),
    x: { to: 70 }, y: { to: 24 }, rotate: { to: 28 },
    opacity: [{ to: 1, duration: 0 }, { to: 0, delay: 260, duration: 200 }],
    duration: 460, delay, ease: EASE_OUT,
    onComplete: () => el.remove(),
  })
}

const CHIP = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" class="chip-inner"/></svg>'

/** A chip stack travels between two points: bets into the pot, the pot to a winner. */
export function chipTo(stage: HTMLElement | null, from: Pt, to: Pt, label: string, delay = 0, sound?: Sfx) {
  if (!stage) return
  if (reduced()) { if (sound) setTimeout(() => sfx(sound), delay); return }
  const el = ghost(stage, CHIP + label, 'bet ghost', from)
  animate(el, {
    onBegin: () => { if (sound) sfx(sound) },
    x: { to: to.x - from.x }, y: { to: to.y - from.y },
    scale: [{ to: 1.1, duration: 120 }, { to: 0.8 }],
    opacity: [{ to: 1, duration: 0 }, { to: 0, delay: 360, duration: 140 }],
    duration: 520, delay, ease: 'inOut(3)',
    onComplete: () => el.remove(),
  })
}

/** Small hand flick each time the dealer releases a card. */
export function flick(el: Element | null) {
  if (!el || reduced()) return
  animate(el, { rotate: [0, -16, 0], y: [0, -3, 0], duration: 160, ease: 'out(2)' })
}

/** Dealer's eyes glance toward a point. */
export function look(el: Element | null, dx: number, dy: number) {
  if (!el) return
  animate(el, { x: dx, y: dy, duration: d(320), ease: EASE_OUT })
}

/** One-shot entrance for side panels: 40ms apart. */
export function panelIn(els: Element[]) {
  if (!els.length || reduced()) return
  animate(els, { opacity: { from: 0, to: 1 }, y: { from: 14, to: 0 }, duration: 420, delay: stagger(40), ease: EASE_OUT })
}

/** Text swap when the explained thing changes (mode descriptions). */
export function swapIn(els: Element[]) {
  if (!els.length || reduced()) return
  animate(els, { opacity: { from: 0, to: 1 }, y: { from: 6, to: 0 }, filter: { from: 'blur(4px)', to: 'blur(0px)' }, duration: 260, delay: stagger(40), ease: EASE_OUT })
}

/** Rows settle in when a list opens (hand guide). */
export function rowsIn(els: Element[], start = 0) {
  if (!els.length || reduced()) return
  animate(els, { opacity: { from: 0, to: 1 }, x: { from: -8, to: 0 }, duration: 320, delay: stagger(28, { start }), ease: EASE_OUT })
}

/** A card flies out of its trigger face-down and flips over to its face. */
export function flipOpen(card: HTMLElement, from: Pt) {
  const c = centre(card)
  if (reduced()) return animate(card, { opacity: { from: 0, to: 1 }, duration: 150, ease: 'out(2)' })
  animate(card, {
    x: { from: from.x - c.x, to: 0 },
    y: { from: from.y - c.y, to: 0 },
    scale: { from: 0.2, to: 1 },
    rotateY: { from: 180, to: 0 },
    rotateZ: { from: -8, to: 0 },
    opacity: [{ from: 0, to: 1, duration: 90 }],
    duration: 640,
    ease: EASE_OUT,
  })
}

/** Exit along the same path, faster: flip back over and return to the trigger. */
export function flipClose(card: HTMLElement, to: Pt, done: () => void) {
  if (reduced()) return done()
  const c = centre(card)
  animate(card, {
    x: { to: to.x - c.x },
    y: { to: to.y - c.y },
    scale: { to: 0.2 },
    rotateY: { to: 180 },
    rotateZ: { to: -8 },
    opacity: [{ to: 0, delay: 260, duration: 80 }],
    duration: 340,
    ease: 'out(2)',
    onComplete: () => {
      // reset for the next open
      card.style.transform = ''
      card.style.opacity = ''
      done()
    },
  })
}

/** Highlight glides to the selected option. */
export function glideTo(el: HTMLElement | null, box: { top: number; height: number }, instant = false) {
  if (!el) return
  animate(el, { y: box.top, height: box.height, duration: instant ? 0 : d(300), ease: EASE_OUT })
}

/** The NOW ticket pops on — a named overshoot case (badge pop). */
export function popIn(el: Element | null) {
  if (!el) return
  return animate(el, { scale: { from: 0.7, to: 1 }, rotate: { from: -6, to: 0 }, duration: d(500), ease: reduced() ? 'linear' : spring({ bounce: 0.35, duration: 500 }) })
}

/** A fresh bet slides out from the player's seat. */
export function slide(el: Element | null, from: Pt) {
  if (!el) return
  const c = centre(el)
  sfx('chips')
  return animate(el, { x: { from: from.x - c.x, to: 0 }, y: { from: from.y - c.y, to: 0 }, opacity: { from: 0.2, to: 1 }, duration: d(480), ease: EASE_OUT })
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

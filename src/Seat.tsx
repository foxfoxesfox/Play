import { createTimer } from 'animejs'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { SeatView, View } from '../shared/poker'
import { Card } from './Card'
import { Icon } from './Icon'
import { centre, countTo, floatUp, popIn, slide } from './motion'
import { savedName, type TableState } from './net'
import { sfx } from './sound'
import { dealOrder, fmt, revealed, showdownMark, usePrev, type Pt, type Send } from './table-util'

export function SeatSpot(p: {
  k: number; s: SeatView; pos: Pt; betPos: Pt; order: number
  v: View; state: TableState; acting: boolean; isMe: boolean; isButton: boolean; winner: number; winHand: string
}) {
  const { s, v, acting } = p
  const ticketRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const betRef = useRef<HTMLDivElement>(null)
  const winRef = useRef<HTMLSpanElement>(null)
  const prevBet = usePrev(s.bet)

  useLayoutEffect(() => { if (acting) popIn(ticketRef.current) }, [acting, v.handNo])
  useLayoutEffect(() => {
    if (s.bet > prevBet && avatarRef.current) slide(betRef.current, centre(avatarRef.current))
  }, [s.bet]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (p.winner) floatUp(winRef.current) }, [p.winner, v.handNo])

  const showCards = !p.isMe && s.cardCount > 0 && s.inHand && !s.folded
  const state = s.folded ? 'folded' : acting ? 'now' : p.winner ? 'won' : ''
  return (
    <>
      <div data-seat={p.k} className={`seat seat--${state || 'idle'}${p.isMe ? ' seat--me' : ''}`} style={{ left: `${p.pos.x}%`, top: `${p.pos.y}%` }}>
        {showCards && (
          <div className="seat__cards">
            {(s.cards ?? Array(s.cardCount).fill(null)).map((c, i) => (
              <Card key={i} card={c} back={!c} className={`card--mini js-deal${showdownMark(v, c)}`} order={dealOrder(v, p.k, i)} />
            ))}
          </div>
        )}
        <div className="seat__avatar" ref={avatarRef} aria-hidden="true">
          {acting && <TurnRing state={p.state} ticketRef={ticketRef} mine={p.isMe} />}
          <span>{s.name.slice(0, 1).toUpperCase()}</span>
          {p.isButton && <span className="dealer-btn" title="Dealer">D</span>}
        </div>
        <div className="ticket" ref={ticketRef}>
          <span className="ticket__name">
            {s.name}{v.hostSeat === p.k && <Icon name="crown" title="Host" />}
          </span>
          <StackNum value={s.stack} />
          {s.bet > 0 && <span className="ticket__bet">bet {fmt(s.bet)}</span>}
          {s.allIn && !s.folded && <span className="ticket__tag">all-in</span>}
          {v.settings.mode === 'draw5' && s.drew !== null && !s.folded && <span className="ticket__tag">drew {s.drew}</span>}
          {acting && <b className="ticket__now">{p.isMe ? 'your turn' : 'now'} <span data-secs /></b>}
        </div>
        {v.phase === 'showdown' && (p.winHand || (revealed(v) && s.hand && !s.folded)) && (
          <span className={`seat__hand${p.winner ? ' is-win' : ''}`}>{p.winHand || s.hand}</span>
        )}
        {p.winner > 0 && <span className="seat__win" ref={winRef}>+{fmt(p.winner)}</span>}
      </div>
      {s.bet > 0 && (
        <div className="bet" ref={betRef} style={{ left: `${p.betPos.x}%`, top: `${p.betPos.y}%` }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" filter="url(#wobble)"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" className="chip-inner" /></svg>
          {fmt(s.bet)}
        </div>
      )}
    </>
  )
}

function StackNum({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null)
  const prev = usePrev(value)
  useLayoutEffect(() => { countTo(ref.current, prev, value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <b className="ticket__stack" ref={ref}>{fmt(value)}</b>
}

/** The signature move: an ink ring that drains around whoever is acting, driven by an anime.js timer.
 *  The ticket's handwriting gets bouncier as time runs out (Shantell Sans BNCE/INFM axes). */
function TurnRing({ state, ticketRef, mine }: { state: TableState; ticketRef: React.RefObject<HTMLDivElement | null>; mine: boolean }) {
  const ring = useRef<SVGCircleElement>(null)
  const total = state.view.settings.turnSeconds * 1000
  useEffect(() => {
    const remaining = Math.max(0, state.deadline - (Date.now() + state.offset))
    const startElapsed = 1 - Math.min(1, remaining / total)
    const secs = ticketRef.current?.querySelector<HTMLElement>('[data-secs]')
    let bounce = -1
    const timer = createTimer({
      duration: Math.max(1, remaining),
      onUpdate: self => {
        const elapsed = startElapsed + (1 - startElapsed) * self.progress
        ring.current?.style.setProperty('stroke-dashoffset', String(elapsed))
        const left = Math.ceil((remaining * (1 - self.progress)) / 1000)
        if (secs && secs.textContent !== `${left}s`) {
          secs.textContent = `${left}s`
          if (mine && left <= 5 && left > 0) sfx('tick') // only your own clock ticks, so the table isn't noisy
        }
        const t = ticketRef.current
        if (t) {
          // per-frame writes to a font axis re-lay-out the ticket, so only write when the rounded value moves
          const u = Math.round(Math.max(0, (elapsed - 0.55) / 0.45) * 20) * 5
          if (u !== bounce) { bounce = u; t.style.fontVariationSettings = `'BNCE' ${u}, 'INFM' ${u}` }
          t.classList.toggle('is-low', left <= 5)
        }
      },
    })
    return () => {
      timer.revert()
      const t = ticketRef.current
      if (t) { t.style.fontVariationSettings = ''; t.classList.remove('is-low') }
    }
  }, [state.deadline, state.offset, total, ticketRef])
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle ref={ring} cx="50" cy="50" r="46" pathLength={1} filter="url(#wobble)" />
    </svg>
  )
}

export function EmptySeat({ k, pos, send }: { k: number; pos: Pt; send: Send }) {
  return (
    <button
      className="seat seat--empty" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      onClick={() => { const n = savedName(); if (n) send({ t: 'sit', name: n, seat: k }); else document.getElementById('nick')?.focus() }}
    >
      <span className="seat__avatar"><Icon name="plus" /></span>
      <span className="ticket ticket--empty">sit here</span>
    </button>
  )
}

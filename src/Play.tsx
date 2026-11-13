import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Action, View } from '../shared/poker'
import { Card } from './Card'
import { centre, dealIn } from './motion'
import type { TableState } from './net'
import { dealOrder, fmt, showdownMark, usePrev, type Send } from './table-util'

const act = (send: Send, action: Action) => send({ t: 'act', action })

export function MyHand({ v, send }: { v: View; send: Send }) {
  const me = v.seats[v.me]!
  const [picked, setPicked] = useState<number[]>([])
  useEffect(() => setPicked([]), [v.handNo, v.phase])
  const drawing = v.phase === 'draw' && v.toAct === v.me
  const cards = me.cards ?? []
  const prevCards = usePrev(cards.join(' '))
  const handRef = useRef<HTMLDivElement>(null)
  // Five-Card Draw: replacement cards come off the deck (same hand, so not the opening deal)
  useLayoutEffect(() => {
    const was = prevCards.split(' ')
    if (!handRef.current || !prevCards || was.length !== cards.length) return
    const fresh = [...handRef.current.querySelectorAll<HTMLElement>('.card')].filter((_, i) => !was.includes(cards[i]))
    const deck = document.querySelector('.deck')
    if (fresh.length && fresh.length < cards.length && deck) dealIn(fresh, centre(deck), 0)
  }, [cards.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cards.length || !me.inHand) return <div className="my-hand my-hand--empty" />
  const n = cards.length
  return (
    <div className={`my-hand${me.folded ? ' is-folded' : ''}`} ref={handRef}>
      <div className="fan" style={{ ['--n' as string]: n }}>
        {cards.map((c, i) => (
          <span key={c} className="fan__slot" style={{ ['--i' as string]: i - (n - 1) / 2 }}>
            <Card
              card={c} selected={picked.includes(i)} className={`card--big js-deal${showdownMark(v, c)}`} order={dealOrder(v, v.me, i)}
              onClick={drawing ? () => setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : [...p, i])) : undefined}
            />
          </span>
        ))}
      </div>
      {me.hand && !me.folded && <p className="my-hand__label">{me.hand}</p>}
      {me.folded && <p className="my-hand__label">folded</p>}
      {drawing && (
        <div className="draw-bar">
          <span>{picked.length ? `Swap ${picked.length} card${picked.length > 1 ? 's' : ''}` : 'Tap cards to swap'}</span>
          <button className="sticker sticker--main" onClick={() => act(send, { type: 'draw', discard: picked })}>
            {picked.length ? `Draw ${picked.length}` : 'Stand pat'}
          </button>
        </div>
      )}
    </div>
  )
}
export function Actions({ state, send }: { state: TableState; send: Send }) {
  const v = state.view
  const L = v.legal
  const [to, setTo] = useState(0)
  useEffect(() => { if (L) setTo(L.minRaiseTo) }, [L?.minRaiseTo, v.toAct]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!L) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === 'f') act(send, { type: 'fold' })
      if (e.key === 'c') act(send, { type: L.canCheck ? 'check' : 'call' })
      if (e.key === 'r' && L.canRaise) act(send, { type: 'raise', to })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [L, to, send])

  if (!L) {
    const actor = v.toAct >= 0 ? v.seats[v.toAct]?.name : null
    // while you draw, the bar under your cards already says what to do
    if (v.phase === 'lobby' || (v.phase === 'draw' && v.toAct === v.me)) return null
    const msg = v.phase === 'showdown' ? 'Next hand in a moment' : actor ? `${actor} to act` : ''
    return <div className="actions actions--idle"><p>{msg}</p></div>
  }
  const limit = v.settings.mode === 'lhe'
  const me = v.seats[v.me]!
  const raiseTo = limit ? L.minRaiseTo : to
  const allIn = raiseTo >= L.maxRaiseTo
  const verb = v.currentBet === 0 ? 'Bet' : 'Raise to'
  const pot = v.pot
  const quick = [
    ['Min', L.minRaiseTo],
    ['½ pot', v.currentBet + Math.max(L.callAmount + Math.round((pot + L.callAmount) / 2), 0)],
    ['Pot', v.currentBet + L.callAmount + pot],
    ['All-in', L.maxRaiseTo],
  ].map(([label, val]) => [label, Math.min(L.maxRaiseTo, Math.max(L.minRaiseTo, val as number))] as const)

  return (
    <div className="actions">
      {L.canRaise && !limit && L.maxRaiseTo > L.minRaiseTo && (
        <div className="raise">
          <label htmlFor="raise">{verb} <b>{fmt(to)}</b></label>
          <input id="raise" type="range" min={L.minRaiseTo} max={L.maxRaiseTo} step={Math.max(1, Math.floor(v.bb / 2))} value={to} onChange={e => setTo(Number(e.target.value))} />
          <div className="raise__quick">
            {quick.map(([label, val]) => <button key={label} className="pill pill--btn" onClick={() => setTo(val)}>{label}</button>)}
          </div>
        </div>
      )}
      <div className="stickers">
        <button className="sticker" onClick={() => act(send, { type: 'fold' })}>Fold<kbd>F</kbd></button>
        <button className="sticker" onClick={() => act(send, { type: L.canCheck ? 'check' : 'call' })}>
          {L.canCheck ? 'Check' : L.callAmount >= me.stack ? `All-in ${fmt(L.callAmount)}` : `Call ${fmt(L.callAmount)}`}<kbd>C</kbd>
        </button>
        {L.canRaise && (
          <button className="sticker sticker--main" onClick={() => act(send, { type: 'raise', to: raiseTo })}>
            {allIn && !limit ? `All-in ${fmt(L.maxRaiseTo)}` : `${verb} ${fmt(raiseTo)}`}<kbd>R</kbd>
          </button>
        )}
      </div>
    </div>
  )
}

import { utils } from 'animejs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MODES, type View } from '../shared/poker'
import { Card } from './Card'
import { Dealer, type DealerApi } from './Dealer'
import { Icon } from './Icon'
import { DEAL_GAP, SHUFFLE_MS, centre, chipTo, countTo, dealBoard, dealIn, gather, popIn, toPile } from './motion'
import { saveName, savedName, type TableState } from './net'
import { EmptySeat, SeatSpot } from './Seat'
import { sfx } from './sound'
import { fmt, showdownMark, usePrev, type Pt, type Send } from './table-util'

/** Seats run clockwise from you (bottom), up the left side and down the right,
 *  leaving the top of the table for the dealer. */
function seatLayout(v: View) {
  const n = v.seats.length
  const me = Math.max(0, v.me)
  const order = Array.from({ length: n }, (_, k) => (me + k) % n)
  const shown = v.me >= 0 ? order.filter(k => v.seats[k]) : order
  const n2 = shown.length
  const left = Math.ceil((n2 - 1) / 2)
  // even spacing round the table, skipping the dealer's gap at the top; capped so small games don't bunch up
  const step = Math.min(292 / n2, 72)
  const angleOf = (i: number) => (i === 0 ? 90 : i <= left ? 90 + i * step : 450 - (n2 - i) * step)
  return shown.map((k, i) => {
    const a = (angleOf(i) * Math.PI) / 180
    return {
      k,
      seat: { x: 50 + 44 * Math.cos(a), y: 50 + 41 * Math.sin(a) },
      bet: { x: 50 + 27 * Math.cos(a), y: 50 + 22 * Math.sin(a) },
    }
  })
}

export function Stage({ state, send, drawerOpen, toggleDrawer }: { state: TableState; send: Send; drawerOpen: boolean; toggleDrawer: () => void }) {
  const v = state.view
  const layout = useMemo(() => seatLayout(v), [v])
  const stageRef = useRef<HTMLDivElement>(null)
  const dealer = useRef<DealerApi>(null)
  const prevHand = usePrev(v.handNo)
  const prevBoard = usePrev(v.board.length)
  const prevPhase = usePrev(v.phase)
  // where chips were sitting last render, so they can be swept into the pot once they vanish
  const bets = layout.flatMap(({ k, bet }) => (v.seats[k]?.bet ? [{ amount: v.seats[k]!.bet, pos: bet }] : []))
  const prevBets = usePrev(bets)

  const toClient = (p: Pt) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: r.left + (p.x / 100) * r.width, y: r.top + (p.y / 100) * r.height }
  }
  const deckPt = () => { const d = dealer.current?.deck(); return d ? centre(d) : null }

  // a new hand: shuffle, then deal one card at a time round the table
  useLayoutEffect(() => {
    if (v.handNo === prevHand || v.phase === 'lobby' || !stageRef.current) return
    const from = deckPt()
    if (!from) return
    const els = [...document.querySelectorAll<HTMLElement>('.js-deal')]
    els.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order))
    utils.set(els, { opacity: 0 })
    dealer.current?.shuffle()
    dealIn(els, from, SHUFFLE_MS + 80, () => dealer.current?.flick())
  }, [v.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

  // the flop, turn and river: burn one, then slide the new cards off the deck and turn them
  useLayoutEffect(() => {
    if (v.board.length <= prevBoard || !stageRef.current) return
    const from = deckPt()
    if (!from) return
    const els = [...stageRef.current.querySelectorAll('.board .card:not(.card--slot)')].slice(prevBoard)
    const holeCards = document.querySelectorAll('.js-deal').length
    const wait = (v.handNo === prevHand ? 0 : SHUFFLE_MS + holeCards * DEAL_GAP + 300) + (prevBets.length ? 520 : 0)
    utils.set(els, { opacity: 0 })
    const landed = toPile(stageRef.current, dealer.current?.deck() ?? null, dealer.current?.pile() ?? null, null, 1, wait)
    pileAt.current = Math.max(pileAt.current, landed)
    dealBoard(els, from, wait + 240)
  }, [v.board.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // end of a betting round: chips sweep into the pot; at showdown the pot goes to the winner(s)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || v.phase === prevPhase) return
    const pot = stage.querySelector('.pot, .result')
    const potPt = pot ? centre(pot) : toClient({ x: 50, y: 55 })
    const swept = v.handNo === prevHand && prevBets.length > 0 && bets.length === 0
    if (swept) prevBets.forEach((b, i) => chipTo(stage, toClient(b.pos), potPt, fmt(b.amount), i * 40, i === 0 ? 'chips' : undefined))
    if (v.phase === 'showdown') {
      v.winners.forEach((w, i) => {
        const av = stage.querySelector(`[data-seat="${w.seat}"] .seat__avatar`)
        if (av) chipTo(stage, potPt, centre(av), fmt(w.amount), (swept ? 560 : 120) + i * 80, i === 0 ? 'win' : undefined)
      })
    }
  }, [v.phase, v.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

  // discard pile: burn cards plus folded hands. It grows when cards land, and is gathered into the deck each new hand.
  const discards = v.burned + v.seats.reduce((t, s) => t + (s?.inHand && s.folded ? s.cardCount : 0), 0)
  const [pile, setPile] = useState(discards)
  const pileAt = useRef(0) // ms until the cards on their way have landed
  const foldedKey = v.seats.map(s => (s?.inHand && s.folded ? 1 : 0)).join('')
  const prevFolded = usePrev(foldedKey)
  useLayoutEffect(() => {
    if (v.handNo !== prevHand || !stageRef.current) return
    v.seats.forEach((s, k) => {
      if (!s || foldedKey[k] !== '1' || prevFolded[k] === '1') return
      const av = stageRef.current!.querySelector(`[data-seat="${k}"] .seat__avatar`)
      const landed = toPile(stageRef.current, dealer.current?.deck() ?? null, dealer.current?.pile() ?? null, av ? centre(av) : null, Math.min(s.cardCount, 2))
      pileAt.current = Math.max(pileAt.current, landed)
    })
  }, [foldedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (discards < pile) { gather(dealer.current?.pile() ?? null, dealer.current?.deck() ?? null, () => setPile(discards)); return }
    const t = setTimeout(() => setPile(discards), pileAt.current)
    pileAt.current = 0
    return () => clearTimeout(t)
  }, [discards]) // eslint-disable-line react-hooks/exhaustive-deps

  // the dealer watches whoever is acting; a soft chime when it's you
  useLayoutEffect(() => {
    const av = v.toAct >= 0 ? stageRef.current?.querySelector(`[data-seat="${v.toAct}"] .seat__avatar`) : null
    dealer.current?.lookAt(av ? centre(av) : null)
    if (v.toAct >= 0 && v.toAct === v.me) sfx('turn')
  }, [v.toAct, layout.length])

  // a check is a knock on the table, a fold is a card tossed away
  const lastLine = v.log.at(-1) ?? ''
  const heard = useRef(false)
  useEffect(() => {
    if (!heard.current) { heard.current = true; return } // not on page load, only for new actions
    if (/ checks$/.test(lastLine)) sfx('knock')
    else if (/ folds$/.test(lastLine)) sfx('deal', 0.7)
  }, [lastLine])

  const winners = new Map(v.winners.map(w => [w.seat, w]))
  const acting = v.toAct
  return (
    <div className="stage" ref={stageRef}>
      <svg className="stage__table" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="500" cy="310" rx="440" ry="255" className="table-line" filter="url(#wobble)" />
        <ellipse cx="500" cy="310" rx="330" ry="180" className="turn-path" />
      </svg>
      <Dealer ref={dealer} discards={pile} />

      <div className="centre">
        <div className="board" aria-label="Board">
          {v.board.map(c => <Card key={c} card={c} className={showdownMark(v, c)} />)}
          {v.settings.mode !== 'draw5' && v.phase !== 'lobby' &&
            Array.from({ length: 5 - v.board.length }, (_, i) => <div key={'e' + i} className="card card--slot" aria-hidden="true" />)}
        </div>
        <Pot v={v} />
      </div>

      {layout.map(({ k, seat, bet }, order) => {
        const s = v.seats[k]
        return s ? (
          <SeatSpot
            key={k} k={k} s={s} pos={seat} betPos={bet} order={order} v={v} state={state}
            acting={acting === k} isMe={k === v.me} isButton={v.button === k && v.phase !== 'lobby'}
            winner={winners.get(k)?.amount ?? 0} winHand={winners.get(k)?.hand ?? ''}
          />
        ) : (
          <EmptySeat key={k} k={k} pos={seat} send={send} />
        )
      })}
      {v.me < 0 && <JoinForm send={send} hosting={v.hostSeat < 0} />}
      {v.phase === 'lobby' && v.me >= 0 && <LobbyNote state={state} send={send} drawerOpen={drawerOpen} toggleDrawer={toggleDrawer} />}
    </div>
  )
}

function Pot({ v }: { v: View }) {
  const ref = useRef<HTMLElement>(null)
  const amount = v.phase === 'showdown' ? v.winners.reduce((t, w) => t + w.amount, 0) : v.pot
  const prev = usePrev(amount)
  useLayoutEffect(() => { countTo(ref.current, prev, amount) }, [amount]) // eslint-disable-line react-hooks/exhaustive-deps
  if (v.phase === 'lobby') return null
  if (v.phase === 'showdown' && v.winners.length) return <Result v={v} />
  const L = v.legal
  return (
    <div className="receipt pot" aria-live="polite">
      <span className="receipt__label">pot</span>
      <b ref={ref} className="pot__amt">{fmt(amount)}</b>
      {L && L.callAmount > 0 && <span className="receipt__sub">to call {L.callAmount}</span>}
    </div>
  )
}

/** Who won, said plainly in the middle of the table. */
function Result({ v }: { v: View }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { popIn(ref.current) }, [v.handNo])
  const name = (k: number) => v.seats[k]?.name ?? 'Someone'
  const ws = v.winners
  const split = ws.length > 1 && ws.every(w => w.hand === ws[0].hand) && new Set(ws.map(w => w.amount)).size === 1
  const total = ws.reduce((t, w) => t + w.amount, 0)
  return (
    <div className="receipt result" ref={ref} role="status" aria-live="polite">
      <span className="result__stamp">{split ? 'split pot' : ws.length > 1 ? 'winners' : 'winner'}</span>
      {split ? (
        <p className="result__line"><mark>{ws.map(w => name(w.seat)).join(' & ')}</mark> split {fmt(total)}</p>
      ) : (
        ws.map(w => (
          <p className="result__line" key={w.seat}><mark>{name(w.seat)}</mark> wins {fmt(w.amount)}</p>
        ))
      )}
      <p className="result__sub">
        {ws[0].hand ? `with ${split || ws.length === 1 ? ws[0].hand.toLowerCase() : 'the best hands'}` : 'everyone else folded'}
      </p>
    </div>
  )
}

function JoinForm({ send, hosting }: { send: Send; hosting: boolean }) {
  const [name, setName] = useState(savedName)
  return (
    <form
      className="join receipt"
      onSubmit={e => { e.preventDefault(); const n = name.trim(); if (!n) return; saveName(n); send({ t: 'sit', name: n }) }}
    >
      <label htmlFor="nick" className="join__label">Your nickname</label>
      <input id="nick" value={name} maxLength={16} autoComplete="nickname" placeholder="e.g. Mei" onChange={e => setName(e.target.value)} autoFocus />
      <button className="sticker sticker--main" disabled={!name.trim()}>{hosting ? 'Sit down and host' : 'Sit down'}</button>
      {hosting && <p className="hint">You'll host: pick the game (No-Limit, Limit or Five-Card Draw), stakes and timer next.</p>}
    </form>
  )
}

function LobbyNote({ state, send, drawerOpen, toggleDrawer }: { state: TableState; send: Send; drawerOpen: boolean; toggleDrawer: () => void }) {
  const v = state.view
  const s = v.settings
  const players = v.seats.filter(Boolean).length
  const host = v.seats[v.hostSeat]?.name ?? 'the host'
  return (
    <div className="lobby-note">
      <p className="lobby-note__title">{players < 2 ? 'Waiting for friends…' : v.isHost ? 'Ready when you are' : `Waiting for ${host} to deal`}</p>
      <p className="lobby-note__sub">{players < 2 ? 'Copy the invite link and send it to them.' : `${players} at the table`}</p>
      <button className={`lobby-note__game${drawerOpen ? ' is-open' : ''}`} onClick={toggleDrawer} aria-expanded={drawerOpen} aria-controls="drawer">
        <b>{MODES[s.mode]}</b> · {s.smallBlind}/{s.bigBlind} · {s.turnSeconds}s turns
        <span>{drawerOpen ? 'Hide' : v.isHost ? 'Game settings' : 'Rules'}<Icon name="arrow" /></span>
      </button>
      {v.isHost && (
        <button className="sticker sticker--main" disabled={players < 2} onClick={() => send({ t: 'start' })}>
          {v.handNo ? 'Resume dealing' : 'Deal first hand'}
        </button>
      )}
    </div>
  )
}

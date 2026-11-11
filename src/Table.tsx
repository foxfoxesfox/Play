import { createTimer, utils } from 'animejs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MODES, type Mode, type Settings, type SeatView, type View } from '../shared/poker'
import type { ClientMsg } from '../shared/protocol'
import { Card } from './Card'
import { Icon } from './Icon'
import { GameChoices, HandGuide, MODE_INFO, SETTING_HINT, TableRules, depth } from './Rules'
import { Dealer, type DealerApi } from './Dealer'
import { Drawer, useDrawer, useMobile } from './Drawer'
import { DEAL_GAP, SHUFFLE_MS, burn, centre, chipTo, countTo, dealBoard, dealIn, floatUp, glideTo, panelIn, popIn, rowsIn, shake, slide, swapIn } from './motion'
import { saveName, savedName, useTable, type TableState } from './net'
import { isMuted, setMuted, sfx } from './sound'

const usePrev = <T,>(v: T) => {
  const r = useRef(v)
  useEffect(() => { r.current = v })
  return r.current
}

export function TablePage({ code }: { code: string }) {
  const { state, error, online, send } = useTable(code)
  const mobile = useMobile()
  const drawer = useDrawer(state ? state.view.phase === 'lobby' : null, mobile)
  const errRef = useRef<HTMLDivElement>(null)
  const [showErr, setShowErr] = useState(false)
  useEffect(() => {
    if (!error) return
    setShowErr(true)
    requestAnimationFrame(() => shake(errRef.current))
    const t = setTimeout(() => setShowErr(false), 3200)
    return () => clearTimeout(t)
  }, [error])

  return (
    <div className="table-page">
      <TopBar code={code} state={state} online={online} send={send} drawerOpen={drawer.open} onDrawer={drawer.toggle} />
      {state ? <Room state={state} send={send} drawer={drawer} mobile={mobile} /> : <p className="loading">Pulling up a chair…</p>}
      <div className={`toast${showErr && error ? ' is-on' : ''}`} ref={errRef} role="status" aria-live="polite">
        {error?.message}
      </div>
    </div>
  )
}

type Send = (m: ClientMsg) => void

function TopBar({ code, state, online, send, drawerOpen, onDrawer }: {
  code: string; state: TableState | null; online: boolean; send: Send; drawerOpen: boolean; onDrawer: () => void
}) {
  const [copied, setCopied] = useState(false)
  const v = state?.view
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* no clipboard */ }
  }
  return (
    <header className="topbar">
      <a className="logo" href="/" aria-label="play home">play<Icon name="pencil" /></a>
      <span className="pill">table {code}</span>
      {v && v.hostSeat >= 0 && <span className="pill pill--quiet">{MODES[v.settings.mode]} · {v.sb}/{v.bb}</span>}
      {!online && <span className="pill pill--warn">reconnecting…</span>}
      <span className="spacer" />
      <button className="pill pill--btn" onClick={copy}>
        <Icon name={copied ? 'check' : 'link'} />{copied ? 'Link copied' : 'Copy invite link'}
      </button>
      {v && v.me >= 0 && (
        <button className="pill pill--btn" onClick={() => { if (confirm('Leave your seat? Your chips stay with the table.')) send({ t: 'leave' }) }}>
          Leave seat
        </button>
      )}
      <SoundToggle />
      <button className={`pill pill--btn${drawerOpen ? ' is-on' : ''}`} onClick={onDrawer} aria-expanded={drawerOpen} aria-controls="drawer">
        <Icon name="menu" />Table
      </button>
    </header>
  )
}

function SoundToggle() {
  const [off, setOff] = useState(isMuted)
  return (
    <button
      className="pill pill--btn" aria-pressed={!off} title={off ? 'Sound is off' : 'Sound is on'}
      onClick={() => { setMuted(!off); setOff(!off); if (off) setTimeout(() => sfx('chips'), 0) }}
    >
      <Icon name={off ? 'soundOff' : 'sound'} />{off ? 'Sound off' : 'Sound'}
    </button>
  )
}

type DrawerCtl = ReturnType<typeof useDrawer>

function Room({ state, send, drawer, mobile }: { state: TableState; send: Send; drawer: DrawerCtl; mobile: boolean }) {
  const v = state.view
  const seated = v.me >= 0
  const roomRef = useRef<HTMLElement>(null)
  const panelsRef = useRef<HTMLDivElement>(null)
  const seen = useRef(new WeakSet<Element>())
  // panels ease in the first time they appear (when the drawer opens, or when you become host), never on routine updates
  useLayoutEffect(() => {
    if (!drawer.open) return
    const fresh = [...(panelsRef.current?.children ?? [])].filter(el => !seen.current.has(el))
    fresh.forEach(el => seen.current.add(el))
    panelIn(fresh)
  })
  return (
    <main className="room" ref={roomRef}>
      <section className="felt-area" aria-label="Poker table">
        <Stage state={state} send={send} drawerOpen={drawer.open} toggleDrawer={drawer.toggle} />
        {seated && (
          <div className="play-row">
            <MyHand v={v} send={send} />
            <Actions state={state} send={send} />
          </div>
        )}
      </section>
      <Drawer open={drawer.open} mobile={mobile} onClose={drawer.close} roomRef={roomRef}>
        <div className="drawer__panels" ref={panelsRef} id="drawer">
          {v.isHost && <HostPanel state={state} send={send} />}
          {v.hostSeat < 0 && <GameChoices />}
          {v.hostSeat >= 0 && !v.isHost && <TableRules s={v.settings} />}
          <HandLog v={v} />
          <HandGuide />
        </div>
      </Drawer>
    </main>
  )
}

// ---------------- table stage ----------------

type Pt = { x: number; y: number }

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

/** Dealing order: one card at a time, starting left of the button. */
export const dealOrder = (v: View, k: number, cardIdx: number) =>
  cardIdx * 16 + ((k - v.button - 1 + 2 * v.seats.length) % v.seats.length)

function Stage({ state, send, drawerOpen, toggleDrawer }: { state: TableState; send: Send; drawerOpen: boolean; toggleDrawer: () => void }) {
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
    burn(stageRef.current, dealer.current?.deck() ?? null, wait)
    dealBoard(els, from, wait + 240)
  }, [v.board.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // end of a betting round: chips sweep into the pot; at showdown the pot goes to the winner(s)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || v.phase === prevPhase) return
    const pot = stage.querySelector('.pot')
    const potPt = pot ? centre(pot) : toClient({ x: 50, y: 55 })
    const swept = v.handNo === prevHand && prevBets.length > 0 && bets.length === 0
    if (swept) prevBets.forEach((b, i) => chipTo(stage, toClient(b.pos), potPt, b.amount.toLocaleString(), i * 40, i === 0 ? 'chips' : undefined))
    if (v.phase === 'showdown') {
      v.winners.forEach((w, i) => {
        const av = stage.querySelector(`[data-seat="${w.seat}"] .seat__avatar`)
        if (av) chipTo(stage, potPt, centre(av), w.amount.toLocaleString(), (swept ? 560 : 120) + i * 80, i === 0 ? 'win' : undefined)
      })
    }
  }, [v.phase, v.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <Dealer ref={dealer} />

      <div className="centre">
        <div className="board" aria-label="Board">
          {v.board.map(c => <Card key={c} card={c} />)}
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
  const L = v.legal
  return (
    <div className="receipt pot" aria-live="polite">
      <span className="receipt__label">pot</span>
      <b ref={ref} className="pot__amt">{amount.toLocaleString()}</b>
      {L && L.callAmount > 0 && <span className="receipt__sub">to call {L.callAmount}</span>}
      {v.phase === 'showdown' && v.winners[0] && (
        <span className="receipt__sub">{v.winners[0].hand ? v.winners[0].hand.toLowerCase() + ' takes it' : 'everyone else folded'}</span>
      )}
    </div>
  )
}

function SeatSpot(p: {
  k: number; s: SeatView; pos: { x: number; y: number }; betPos: { x: number; y: number }; order: number
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
              <Card key={i} card={c} back={!c} className="card--mini js-deal" style={{ zIndex: i }} order={dealOrder(v, p.k, i)} />
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
            {acting && <b className="ticket__now">NOW</b>}
            {s.name}{v.hostSeat === p.k && <Icon name="crown" title="Host" />}
            {acting && <span className="ticket__secs" data-secs />}
          </span>
          <StackNum value={s.stack} />
          {s.allIn && !s.folded && <span className="ticket__tag">all-in</span>}
          {v.settings.mode === 'draw5' && s.drew !== null && !s.folded && <span className="ticket__tag">drew {s.drew}</span>}
        </div>
        {p.winHand && <span className="seat__hand">{p.winHand}</span>}
        {p.winner > 0 && <span className="seat__win" ref={winRef}>+{p.winner.toLocaleString()}</span>}
      </div>
      {s.bet > 0 && (
        <div className="bet" ref={betRef} style={{ left: `${p.betPos.x}%`, top: `${p.betPos.y}%` }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" filter="url(#wobble)"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" className="chip-inner" /></svg>
          {s.bet.toLocaleString()}
        </div>
      )}
    </>
  )
}

function StackNum({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null)
  const prev = usePrev(value)
  useLayoutEffect(() => { countTo(ref.current, prev, value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <b className="ticket__stack" ref={ref}>{value.toLocaleString()}</b>
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
          const u = Math.max(0, (elapsed - 0.55) / 0.45)
          t.style.fontVariationSettings = `'BNCE' ${Math.round(u * 100)}, 'INFM' ${Math.round(u * 100)}`
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

function EmptySeat({ k, pos, send }: { k: number; pos: { x: number; y: number }; send: Send }) {
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

// ---------------- my hand ----------------

function MyHand({ v, send }: { v: View; send: Send }) {
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
              card={c} selected={picked.includes(i)} className="card--big js-deal" order={dealOrder(v, v.me, i)}
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
          <button className="sticker sticker--main" onClick={() => send({ t: 'act', action: { type: 'draw', discard: picked } })}>
            {picked.length ? `Draw ${picked.length}` : 'Stand pat'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------- side column ----------------

function HandLog({ v }: { v: View }) {
  const start = v.log.findLastIndex(l => l.startsWith('—'))
  const lines = start >= 0 ? v.log.slice(start + 1) : v.log
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6 }) }, [lines.length])
  return (
    <section className="receipt log" aria-label="Hand log">
      <h2 className="log__title">{v.handNo ? `this hand · #${v.handNo}` : 'at the table'}</h2>
      <ol ref={listRef}>
        {lines.map((l, i) => {
          const m = l.match(/^(.*?)(\d[\d,]*)(?: \(all-in\))?$/)
          return (
            <li key={i}>
              <span>{cardsInText(m && !l.includes(':') ? m[1].trim() : l)}</span>
              {m && !l.includes(':') && <span className="num">{m[2]}</span>}
            </li>
          )
        })}
        {v.toAct >= 0 && <li className="log__live"><span>{v.seats[v.toAct]?.name} is thinking…</span></li>}
      </ol>
    </section>
  )
}

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
/** "9c 8h" → 9♣ 8♥ with red suits inked red, for the receipt log. */
function cardsInText(text: string) {
  return text.split(/\b([2-9TJQKA][shdc])\b/).map((part, i) =>
    i % 2 ? <span key={i} className={part[1] === 'h' || part[1] === 'd' ? 'suit-red' : ''}>{part[0] === 'T' ? '10' : part[0]}{SUIT_GLYPH[part[1]]}</span> : part)
}

function Actions({ state, send }: { state: TableState; send: Send }) {
  const v = state.view
  const L = v.legal
  const [to, setTo] = useState(0)
  useEffect(() => { if (L) setTo(L.minRaiseTo) }, [L?.minRaiseTo, v.toAct]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!L) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === 'f') send({ t: 'act', action: { type: 'fold' } })
      if (e.key === 'c') send({ t: 'act', action: { type: L.canCheck ? 'check' : 'call' } })
      if (e.key === 'r' && L.canRaise) send({ t: 'act', action: { type: 'raise', to } })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [L, to, send])

  if (!L) {
    const actor = v.toAct >= 0 ? v.seats[v.toAct]?.name : null
    if (v.phase === 'lobby') return null
    const msg = v.phase === 'showdown' ? 'Next hand in a moment' : v.phase === 'draw' && v.toAct === v.me ? 'Pick cards to swap' : actor ? `${actor} to act` : ''
    return <div className="actions actions--idle"><p>{msg}</p></div>
  }
  const limit = v.settings.mode === 'lhe'
  const me = v.seats[v.me]!
  const allIn = to >= L.maxRaiseTo
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
          <label htmlFor="raise">{verb} <b>{to.toLocaleString()}</b></label>
          <input id="raise" type="range" min={L.minRaiseTo} max={L.maxRaiseTo} step={Math.max(1, Math.floor(v.bb / 2))} value={to} onChange={e => setTo(Number(e.target.value))} />
          <div className="raise__quick">
            {quick.map(([label, val]) => <button key={label} className="pill pill--btn" onClick={() => setTo(val)}>{label}</button>)}
          </div>
        </div>
      )}
      <div className="stickers">
        <button className="sticker" onClick={() => send({ t: 'act', action: { type: 'fold' } })}>Fold<kbd>F</kbd></button>
        <button className="sticker" onClick={() => send({ t: 'act', action: { type: L.canCheck ? 'check' : 'call' } })}>
          {L.canCheck ? 'Check' : L.callAmount >= me.stack ? `All-in ${L.callAmount}` : `Call ${L.callAmount}`}<kbd>C</kbd>
        </button>
        {L.canRaise && (
          <button className="sticker sticker--main" onClick={() => send({ t: 'act', action: { type: 'raise', to: limit ? L.minRaiseTo : to } })}>
            {allIn && !limit ? `All-in ${L.maxRaiseTo}` : `${verb} ${limit ? L.minRaiseTo : to}`}<kbd>R</kbd>
          </button>
        )}
      </div>
    </div>
  )
}

function HostPanel({ state, send }: { state: TableState; send: Send }) {
  const v = state.view
  const [s, setS] = useState<Settings>(v.settings)
  // only take the server's settings when they actually change, so updates don't wipe unsaved edits
  const serverSettings = JSON.stringify(v.settings)
  useEffect(() => setS(JSON.parse(serverSettings)), [serverSettings])
  const lobby = v.phase === 'lobby'
  const players = v.seats.filter(Boolean).length
  const dirty = JSON.stringify(s) !== JSON.stringify(v.settings)
  const num = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: Math.round(Number(e.target.value)) })
  const segRef = useRef<HTMLDivElement>(null)
  const hiRef = useRef<HTMLSpanElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const firstGlide = useRef(true)
  // the highlight glides to the chosen game, and its description swaps in
  useLayoutEffect(() => {
    const on = segRef.current?.querySelector<HTMLElement>('label.is-on')
    if (!on) return
    glideTo(hiRef.current, { top: on.offsetTop, height: on.offsetHeight }, firstGlide.current)
    if (!firstGlide.current && hintRef.current) swapIn([...hintRef.current.children])
    firstGlide.current = false
  }, [s.mode, lobby])

  return (
    <section className="host receipt" aria-label="Host controls">
      <h2 className="log__title"><Icon name="crown" /> you're hosting</h2>
      {lobby ? (
        <form className="host__form" onSubmit={e => { e.preventDefault(); send({ t: 'settings', settings: s }) }}>
          <fieldset className="seg">
            <legend className="host__legend">Game</legend>
            <div className="seg__opts" ref={segRef}>
            <span className="seg__hi" ref={hiRef} aria-hidden="true" />
            {(Object.keys(MODES) as Mode[]).map(m => (
              <label key={m} className={s.mode === m ? 'is-on' : ''}>
                <input type="radio" name="mode" checked={s.mode === m} onChange={() => setS({ ...s, mode: m })} />
                <span className="seg__name">{MODES[m]}</span>
                <span className="seg__tag">{MODE_INFO[m].tagline}</span>
              </label>
            ))}
            </div>
          </fieldset>
          <div className="hint" ref={hintRef}>
            <p>{MODE_INFO[s.mode].how}</p>
            <p>{MODE_INFO[s.mode].betting}</p>
          </div>

          <fieldset className="host__set">
            <legend className="host__legend">Stakes</legend>
            <div className="host__grid">
              <label>Small blind<input type="number" min={1} value={s.smallBlind} onChange={num('smallBlind')} /></label>
              <label>Big blind<input type="number" min={2} value={s.bigBlind} onChange={num('bigBlind')} /></label>
            </div>
            <p className="hint">{SETTING_HINT.blinds}</p>
            <label className="host__wide">Starting chips<input type="number" min={100} step={100} value={s.startingStack} onChange={num('startingStack')} /></label>
            <p className="hint">{SETTING_HINT.startingStack} {depth(s).line}</p>
          </fieldset>

          <fieldset className="host__set">
            <legend className="host__legend">Pace</legend>
            <label className="host__wide">Turn timer (seconds)<input type="number" min={10} max={120} value={s.turnSeconds} onChange={num('turnSeconds')} /></label>
            <p className="hint">{SETTING_HINT.turnSeconds}</p>
            <label className="check"><input type="checkbox" checked={s.risingBlinds} onChange={e => setS({ ...s, risingBlinds: e.target.checked })} /><span><b>Rising blinds.</b> Blinds double every 10 hands, so stakes climb and the game finishes sooner.</span></label>
            <label className="check"><input type="checkbox" checked={s.rebuys} onChange={e => setS({ ...s, rebuys: e.target.checked })} /><span><b>Rebuys.</b> Run out of chips and you get a fresh stack next hand, so nobody sits out. Turn off for a last-one-standing game.</span></label>
          </fieldset>
          {dirty && <button className="sticker">Save settings</button>}
        </form>
      ) : (
        <p className="host__note">{state.autoDeal ? 'Dealing hand after hand.' : 'Pausing after this hand.'}</p>
      )}
      <div className="host__row">
        {lobby || !state.autoDeal
          ? <button className="sticker sticker--main" disabled={players < 2 || dirty} onClick={() => send({ t: 'start' })}>{v.handNo ? 'Resume dealing' : 'Deal first hand'}</button>
          : <button className="sticker" onClick={() => send({ t: 'pause' })}>Pause after this hand</button>}
        {lobby && players < 2 && <p className="hint">Needs at least 2 players. Send the invite link.</p>}
        {lobby && dirty && <p className="hint">Save your settings first.</p>}
      </div>
      {players > 1 && (
        <details className="host__players">
          <summary>Players</summary>
          <ul>
            {v.seats.map((p, k) => p && k !== v.me && (
              <li key={k}>{p.name}<button className="pill pill--btn" onClick={() => { if (confirm(`Remove ${p.name} from the table?`)) send({ t: 'kick', seat: k }) }}>Remove</button></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}


import { createTimer } from 'animejs'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MODES, type Mode, type Settings, type SeatView, type View } from '../shared/poker'
import type { ClientMsg } from '../shared/protocol'
import { Card } from './Card'
import { Icon } from './Icon'
import { HandGuide, MODE_INFO, SETTING_HINT, TableRules, depth } from './Rules'
import { centre, countTo, dealIn, flipIn, floatUp, popIn, shake, slide } from './motion'
import { saveName, savedName, useTable, type TableState } from './net'

const usePrev = <T,>(v: T) => {
  const r = useRef(v)
  useEffect(() => { r.current = v })
  return r.current
}

export function TablePage({ code }: { code: string }) {
  const { state, error, online, send } = useTable(code)
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
      <TopBar code={code} state={state} online={online} send={send} />
      {state ? <Room state={state} send={send} /> : <p className="loading">Pulling up a chair…</p>}
      <div className={`toast${showErr && error ? ' is-on' : ''}`} ref={errRef} role="status" aria-live="polite">
        {error?.message}
      </div>
    </div>
  )
}

type Send = (m: ClientMsg) => void

function TopBar({ code, state, online, send }: { code: string; state: TableState | null; online: boolean; send: Send }) {
  const [copied, setCopied] = useState(false)
  const v = state?.view
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* no clipboard */ }
  }
  return (
    <header className="topbar">
      <a className="logo" href="/" aria-label="play home">play<Icon name="pencil" /></a>
      <span className="pill">table {code}</span>
      {v && <span className="pill pill--quiet">{MODES[v.settings.mode]} · {v.sb}/{v.bb}</span>}
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
    </header>
  )
}

function Room({ state, send }: { state: TableState; send: Send }) {
  const v = state.view
  const seated = v.me >= 0
  return (
    <main className="room">
      <section className="felt-area" aria-label="Poker table">
        <Stage state={state} send={send} />
        {seated && <MyHand v={v} send={send} />}
      </section>
      <aside className="side">
        <HandLog v={v} />
        {v.isHost && <HostPanel state={state} send={send} />}
        {!v.isHost && v.phase === 'lobby' && <TableRules s={v.settings} />}
        <HandGuide />
        {seated && <Actions state={state} send={send} />}
      </aside>
    </main>
  )
}

// ---------------- table stage ----------------

function seatLayout(v: View) {
  const n = v.seats.length
  const me = Math.max(0, v.me)
  const order = Array.from({ length: n }, (_, k) => (me + k) % n)
  const shown = v.me >= 0 ? order.filter(k => v.seats[k]) : order
  return shown.map((k, i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / shown.length
    return {
      k,
      seat: { x: 50 + 44 * Math.cos(a), y: 50 + 41 * Math.sin(a) },
      bet: { x: 50 + 27 * Math.cos(a), y: 50 + 20 * Math.sin(a) },
    }
  })
}

function Stage({ state, send }: { state: TableState; send: Send }) {
  const v = state.view
  const layout = useMemo(() => seatLayout(v), [v])
  const stageRef = useRef<HTMLDivElement>(null)
  const dealerRef = useRef<HTMLDivElement>(null)
  const prevHand = usePrev(v.handNo)
  const prevBoard = usePrev(v.board.length)

  // deal: every hole card flies in from the dealer spot when a new hand starts
  useLayoutEffect(() => {
    if (v.handNo === prevHand || v.phase === 'lobby' || !stageRef.current || !dealerRef.current) return
    const from = centre(dealerRef.current)
    const els = [...document.querySelectorAll('.js-deal')]
    els.sort((a, b) => Number((a as HTMLElement).dataset.order) - Number((b as HTMLElement).dataset.order))
    dealIn(els, from)
  }, [v.handNo]) // eslint-disable-line react-hooks/exhaustive-deps

  // board: newly turned cards flip over
  useLayoutEffect(() => {
    if (v.board.length <= prevBoard || !stageRef.current) return
    const els = [...stageRef.current.querySelectorAll('.board .card')].slice(prevBoard)
    flipIn(els, v.handNo === prevHand ? 0 : 200)
  }, [v.board.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const winners = new Map(v.winners.map(w => [w.seat, w]))
  const acting = v.toAct
  return (
    <div className="stage" ref={stageRef}>
      <svg className="stage__table" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="500" cy="310" rx="440" ry="255" className="table-line" filter="url(#wobble)" />
        <ellipse cx="500" cy="310" rx="330" ry="180" className="turn-path" />
      </svg>
      <div className="dealer-spot" ref={dealerRef} />

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
      {v.me < 0 && <JoinForm send={send} />}
      {v.phase === 'lobby' && v.me >= 0 && <LobbyNote state={state} />}
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
      <div className={`seat seat--${state || 'idle'}${p.isMe ? ' seat--me' : ''}`} style={{ left: `${p.pos.x}%`, top: `${p.pos.y}%` }}>
        {showCards && (
          <div className="seat__cards">
            {(s.cards ?? Array(s.cardCount).fill(null)).map((c, i) => (
              <Card key={i} card={c} back={!c} className="card--mini js-deal" style={{ zIndex: i }} />
            ))}
          </div>
        )}
        <div className="seat__avatar" ref={avatarRef} aria-hidden="true">
          {acting && <TurnRing state={p.state} ticketRef={ticketRef} />}
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
function TurnRing({ state, ticketRef }: { state: TableState; ticketRef: React.RefObject<HTMLDivElement | null> }) {
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
        if (secs) secs.textContent = `${left}s`
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

function JoinForm({ send }: { send: Send }) {
  const [name, setName] = useState(savedName)
  return (
    <form
      className="join receipt"
      onSubmit={e => { e.preventDefault(); const n = name.trim(); if (!n) return; saveName(n); send({ t: 'sit', name: n }) }}
    >
      <label htmlFor="nick" className="join__label">Your nickname</label>
      <input id="nick" value={name} maxLength={16} autoComplete="nickname" placeholder="e.g. Mei" onChange={e => setName(e.target.value)} autoFocus />
      <button className="sticker sticker--main" disabled={!name.trim()}>Sit down</button>
    </form>
  )
}

function LobbyNote({ state }: { state: TableState }) {
  const v = state.view
  const players = v.seats.filter(Boolean).length
  const host = v.seats[v.hostSeat]?.name ?? 'the host'
  return (
    <div className="lobby-note">
      <p className="lobby-note__title">{players < 2 ? 'Waiting for friends…' : v.isHost ? 'Ready when you are' : `Waiting for ${host} to deal`}</p>
      <p className="lobby-note__sub">{players < 2 ? 'Copy the invite link and send it to them.' : `${players} at the table`}</p>
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
  if (!cards.length || !me.inHand) return <div className="my-hand my-hand--empty" />
  const n = cards.length
  return (
    <div className={`my-hand${me.folded ? ' is-folded' : ''}`}>
      <div className="fan" style={{ ['--n' as string]: n }}>
        {cards.map((c, i) => (
          <span key={c} className="fan__slot" style={{ ['--i' as string]: i - (n - 1) / 2 }}>
            <Card
              card={c} selected={picked.includes(i)} className="card--big js-deal"
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
  useEffect(() => setS(v.settings), [v.settings])
  const lobby = v.phase === 'lobby'
  const players = v.seats.filter(Boolean).length
  const dirty = JSON.stringify(s) !== JSON.stringify(v.settings)
  const num = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: Math.round(Number(e.target.value)) })

  return (
    <section className="host receipt" aria-label="Host controls">
      <h2 className="log__title"><Icon name="crown" /> you're hosting</h2>
      {lobby ? (
        <form className="host__form" onSubmit={e => { e.preventDefault(); send({ t: 'settings', settings: s }) }}>
          <fieldset className="seg">
            <legend className="host__legend">Game</legend>
            {(Object.keys(MODES) as Mode[]).map(m => (
              <label key={m} className={s.mode === m ? 'is-on' : ''}>
                <input type="radio" name="mode" checked={s.mode === m} onChange={() => setS({ ...s, mode: m })} />
                <span className="seg__name">{MODES[m]}</span>
                <span className="seg__tag">{MODE_INFO[m].tagline}</span>
              </label>
            ))}
          </fieldset>
          <div className="hint">
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


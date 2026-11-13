import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MODES, type Mode, type Settings } from '../shared/poker'
import { Icon } from './Icon'
import { MODE_INFO, SETTING_HINT, depth } from './Rules'
import { glideTo, swapIn } from './motion'
import type { TableState } from './net'
import type { Send } from './table-util'

export function HostPanel({ state, send }: { state: TableState; send: Send }) {
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

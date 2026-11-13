import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MODES } from '../shared/poker'
import { Drawer, useDrawer, useMobile } from './Drawer'
import { HostPanel } from './Host'
import { Icon } from './Icon'
import { LogButton } from './Log'
import { Actions, MyHand } from './Play'
import { GameChoices, HandGuide, TableRules } from './Rules'
import { Stage } from './Stage'
import { panelIn, shake } from './motion'
import { useTable, type TableState } from './net'
import { isMuted, setMuted, sfx } from './sound'
import type { Send } from './table-util'

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
      <TopBar code={code} state={state} online={online} drawerOpen={drawer.open} onDrawer={drawer.toggle} />
      {state ? <Room state={state} send={send} drawer={drawer} mobile={mobile} /> : <p className="loading">Pulling up a chair…</p>}
      <div className={`toast${showErr && error ? ' is-on' : ''}`} ref={errRef} role="status" aria-live="polite">
        {error?.message}
      </div>
    </div>
  )
}

function TopBar({ code, state, online, drawerOpen, onDrawer }: {
  code: string; state: TableState | null; online: boolean; drawerOpen: boolean; onDrawer: () => void
}) {
  const [copied, setCopied] = useState(false)
  const v = state?.view
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* no clipboard */ }
  }
  return (
    <header className="topbar">
      <a className="logo" href="/" aria-label="play home">play<Icon name="pencil" /></a>
      <button className="pill pill--btn invite" onClick={copy} aria-label={`Copy invite link for table ${code}`}>
        <Icon name={copied ? 'check' : 'link'} />
        {copied ? 'Link copied' : <><span className="pill__label">Invite</span><b>{code}</b></>}
      </button>
      {v && v.hostSeat >= 0 && <span className="topbar__game">{MODES[v.settings.mode]} · {v.sb}/{v.bb}</span>}
      <span className="spacer" />
      {!online && <span className="pill pill--warn" role="status">reconnecting…</span>}
      <SoundToggle />
      <button className={`pill pill--btn${drawerOpen ? ' is-on' : ''}`} onClick={onDrawer} aria-label={v?.isHost ? 'Game settings' : 'Table rules'} aria-expanded={drawerOpen} aria-controls="drawer">
        <Icon name="menu" /><span className="pill__label">{v?.isHost ? 'Settings' : 'Rules'}</span>
      </button>
    </header>
  )
}

function SoundToggle() {
  const [off, setOff] = useState(isMuted)
  return (
    <button
      className="pill pill--btn" aria-pressed={!off} aria-label="Sound" title={off ? 'Sound is off' : 'Sound is on'}
      onClick={() => { setMuted(!off); setOff(!off); if (off) setTimeout(() => sfx('chips'), 0) }}
    >
      <Icon name={off ? 'soundOff' : 'sound'} /><span className="pill__label">{off ? 'Sound off' : 'Sound'}</span>
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
        <div className="table-tools">
          <LogButton v={v} />
          <HandGuide />
        </div>
        {seated && v.phase !== 'lobby' && (
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
          {seated && (
            <button className="pill pill--btn leave" onClick={() => { if (confirm('Leave your seat? Your chips stay with the table.')) send({ t: 'leave' }) }}>
              Leave seat
            </button>
          )}
        </div>
      </Drawer>
    </main>
  )
}

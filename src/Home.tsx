import { useLayoutEffect, useRef, useState } from 'react'
import { stagger, animate } from 'animejs'
import { Card } from './Card'
import { Icon } from './Icon'
import { reduced } from './motion'

export function Home({ go }: { go: (path: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const fanRef = useRef<HTMLDivElement>(null)

  // the one authored moment on the hub: the hand fans open
  useLayoutEffect(() => {
    if (!fanRef.current) return
    const still = reduced()
    animate(fanRef.current.querySelectorAll('.card'), {
      rotate: { from: 0, to: stagger([-16, 16]) },
      x: { from: 0, to: stagger([-66, 66]) },
      y: { from: 24, to: 0 },
      opacity: { from: 0, to: 1 },
      delay: still ? 0 : stagger(80, { start: 150 }),
      duration: still ? 0 : 700,
      ease: 'out(4)',
    })
  }, [])

  const open = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/tables', { method: 'POST' })
      if (!r.ok) throw new Error()
      const { code } = (await r.json()) as { code: string }
      go(`/t/${code}`)
    } catch {
      setErr('Could not open a table. Check your connection and try again.')
      setBusy(false)
    }
  }
  const join = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toLowerCase().replace(/.*\/t\//, '')
    if (/^[a-z]{3}-\d{6}$/.test(c)) go(`/t/${c}`)
    else setErr('Table codes look like fox-123456.')
  }

  return (
    <div className="home">
      <header className="topbar topbar--home">
        <a className="logo" href="/">play<Icon name="pencil" /></a>
      </header>
      <main className="home__main">
        <section className="home__hero">
          <h1>Pull up a chair.</h1>
          <p className="home__lede">Open a table, send your friends the link, and play. No accounts, no downloads.</p>
        </section>

        <section className="game" aria-labelledby="poker-title">
          <div className="game__art" ref={fanRef} aria-hidden="true">
            <Card card="As" />
            <Card card="Kh" />
            <Card card="Qc" />
            <Card back />
          </div>
          <div className="game__body">
            <h2 id="poker-title">Poker</h2>
            <p>No-Limit or Limit Hold'em, or Five-Card Draw. Two to nine players, play chips only.</p>
            <div className="game__actions">
              <button className="sticker sticker--main" onClick={open} disabled={busy}>
                {busy ? 'Opening…' : 'Open a table'}<Icon name="arrow" />
              </button>
              <form className="join-code" onSubmit={join}>
                <label htmlFor="code" className="sr-only">Table code or invite link</label>
                <input id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="have a code? fox-123456" />
                <button className="sticker" disabled={!code.trim()}>Join</button>
              </form>
            </div>
            {err && <p className="form-err" role="alert">{err}</p>}
          </div>
        </section>

        <p className="home__more">More games are on the way.</p>
      </main>
    </div>
  )
}

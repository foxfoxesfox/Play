import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { View } from '../shared/poker'
import { Icon } from './Icon'
import { popClose, popOpen } from './motion'

/** "History" button: shows the latest action, opens the hand history as a small receipt. */
export function LogButton({ v }: { v: View }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const close = () => { if (popRef.current) popClose(popRef.current, () => setOpen(false)); else setOpen(false) }
  useLayoutEffect(() => { if (open && popRef.current) popOpen(popRef.current) }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => { removeEventListener('pointerdown', onDown); removeEventListener('keydown', onKey) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const last = v.log.at(-1) ?? ''
  return (
    <div className="table-tool-wrap" ref={wrapRef}>
      {open && <div className="log-pop" ref={popRef} id="hand-log"><HandLog v={v} /></div>}
      <button className="table-tool table-tool--log" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-controls="hand-log">
        <Icon name="menu" />
        <b>History</b>
        {last && <span className="table-tool__last">{cardsInText(last.replace(/^— /, ''))}</span>}
      </button>
    </div>
  )
}

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

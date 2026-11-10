import { animate, spring, utils } from 'animejs'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { reduced } from './motion'

const DRAWER_W = 360
const KEY = 'play.drawer'

export const useMobile = () => {
  const q = '(max-width: 960px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

const readPref = () => { try { return localStorage.getItem(KEY) as 'open' | 'closed' | null } catch { return null } }
const writePref = (v: 'open' | 'closed') => { try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }

/** Open/closed state. Opens itself in the lobby on desktop and closes when dealing starts,
 *  unless you've opened or closed it yourself, which it then remembers. */
export function useDrawer(lobby: boolean | null, mobile: boolean) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (lobby === null) return
    const pref = readPref()
    if (mobile) return setOpen(false)
    setOpen(pref === 'open' ? true : pref === 'closed' ? false : lobby)
  }, [lobby, mobile])
  return {
    open,
    toggle: () => setOpen(o => { writePref(o ? 'closed' : 'open'); return !o }),
    close: () => { writePref('closed'); setOpen(false) },
  }
}

/** Desktop: a column that slides in and pushes the table over. Phone: a bottom sheet you can swipe down. */
export function Drawer({ open, mobile, onClose, roomRef, children }: {
  open: boolean; mobile: boolean; onClose: () => void; roomRef: RefObject<HTMLElement | null>; children: ReactNode
}) {
  const sheetRef = useRef<HTMLElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useLayoutEffect(() => {
    const room = roomRef.current, sheet = sheetRef.current, scrim = scrimRef.current
    if (!room || !sheet) return
    const instant = first.current || reduced()
    first.current = false
    if (!mobile) {
      utils.set(sheet, { y: 0 })
      animate(room, {
        '--drawer-w': `${open ? DRAWER_W : 0}px`,
        duration: instant ? 0 : open ? 380 : 260,
        ease: open ? 'out(4)' : 'out(2)',
      })
      animate(sheet.firstElementChild!, { opacity: open ? 1 : 0, x: open ? 0 : 24, duration: instant ? 0 : open ? 320 : 180, ease: 'out(3)' })
      return
    }
    room.style.setProperty('--drawer-w', '0px')
    utils.set(sheet.firstElementChild!, { opacity: 1, x: 0 })
    animate(sheet, { y: open ? '0%' : '100%', duration: instant ? 0 : open ? 420 : 260, ease: open ? spring({ bounce: 0, duration: 420 }) : 'out(2)' })
    if (scrim) animate(scrim, { opacity: open ? 1 : 0, duration: instant ? 0 : 220, ease: 'out(2)' })
  }, [open, mobile, roomRef])

  // phone: drag the handle down to dismiss; let go early and it springs back
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (!mobile) return
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !sheetRef.current) return
    d.dy = Math.max(0, e.clientY - d.y0)
    utils.set(sheetRef.current, { y: d.dy })
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !sheetRef.current) return
    const velocity = d.dy / Math.max(1, performance.now() - d.t0) // px per ms
    if (d.dy > 110 || velocity > 0.6) onClose()
    else animate(sheetRef.current, { y: 0, ease: spring({ bounce: 0, duration: 320 }) })
  }

  return (
    <>
      {mobile && <div className="drawer-scrim" ref={scrimRef} onClick={onClose} style={{ pointerEvents: open ? 'auto' : 'none' }} aria-hidden="true" />}
      <aside ref={sheetRef} className="drawer" aria-label="Table info" inert={!open} aria-hidden={!open}>
        <div className="drawer__inner">
          {mobile && (
            <div className="drawer__grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <span />
            </div>
          )}
          {children}
        </div>
      </aside>
    </>
  )
}

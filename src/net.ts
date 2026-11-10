import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../shared/poker'
import type { ClientMsg, ServerMsg } from '../shared/protocol'

let memoryId = ''
/** Private per-browser player token; it is what keeps your seat across refreshes. */
export function playerId() {
  try {
    let id = localStorage.getItem('play.id')
    if (!id) { id = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem('play.id', id) }
    return id
  } catch {
    return (memoryId ||= crypto.randomUUID().replace(/-/g, ''))
  }
}
export const savedName = () => { try { return localStorage.getItem('play.name') ?? '' } catch { return '' } }
export const saveName = (n: string) => { try { localStorage.setItem('play.name', n) } catch { /* private mode */ } }

export interface TableState { view: View; deadline: number; offset: number; autoDeal: boolean }

export function useTable(code: string) {
  const [state, setState] = useState<TableState | null>(null)
  const [error, setError] = useState<{ message: string; at: number } | null>(null)
  const [online, setOnline] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let dead = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout>
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/tables/${code}/ws`)
      wsRef.current = ws
      ws.onopen = () => { retry = 0; setOnline(true); ws.send(JSON.stringify({ t: 'hello', id: playerId() } satisfies ClientMsg)) }
      ws.onmessage = e => {
        const m: ServerMsg = JSON.parse(e.data)
        if (m.t === 'state') setState({ view: m.view, deadline: m.deadline, autoDeal: m.autoDeal, offset: m.now - Date.now() })
        else setError({ message: m.message, at: Date.now() })
      }
      ws.onclose = () => {
        setOnline(false)
        if (!dead) timer = setTimeout(connect, Math.min(5000, 400 * 2 ** retry++))
      }
    }
    connect()
    return () => { dead = true; clearTimeout(timer); wsRef.current?.close() }
  }, [code])

  const send = useCallback((m: ClientMsg) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
    else setError({ message: 'Reconnecting… try again in a second', at: Date.now() })
  }, [])

  return { state, error, online, send }
}

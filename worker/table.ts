import { DurableObject } from 'cloudflare:workers'
import {
  act, canStart, leave, legal, newGame, sit, startHand, viewFor, MAX_SEATS, MODES,
  type Action, type Game, type Mode, type Settings,
} from '../shared/poker'
import type { ClientMsg, ServerMsg } from '../shared/protocol'
import type { Env } from './index'

const SHOWDOWN_MS = 6000

interface Meta {
  autoDeal: boolean
  turnKey: string
  turnDeadline: number
  nextHandAt: number
  reportedHand?: number
}

/** One poker table. Holds authoritative state and every player's socket (hibernation API). */
export class Table extends DurableObject<Env> {
  game: Game = newGame()
  meta: Meta = { autoDeal: false, turnKey: '', turnDeadline: 0, nextHandAt: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get<Game>('game')) ?? newGame()
      this.meta = (await ctx.storage.get<Meta>('meta')) ?? this.meta
    })
  }

  async fetch(req: Request) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 2000) return
    let msg: ClientMsg
    try { msg = JSON.parse(raw) } catch { return }
    const id: string | undefined = ws.deserializeAttachment()?.id
    const g = this.game
    const err = (message: string) => send(ws, { t: 'error', message })

    if (msg.t === 'hello') {
      if (typeof msg.id !== 'string' || !/^[\w-]{16,64}$/.test(msg.id)) return err('Bad player id')
      ws.serializeAttachment({ id: msg.id })
      return this.sendState(ws, msg.id)
    }
    if (!id) return err('Say hello first')
    const seat = g.seats.findIndex(s => s?.id === id)
    const isHost = g.hostId === id

    switch (msg.t) {
      case 'sit': {
        const name = cleanName(msg.name)
        if (!name) return err('Pick a nickname (1–16 characters)')
        const r = sit(g, id, name, typeof msg.seat === 'number' ? msg.seat : undefined)
        if (typeof r === 'string') return err(r)
        break
      }
      case 'act': {
        if (seat < 0) return err('Sit down first')
        const a = cleanAction(msg.action)
        if (!a) return err('Bad action')
        const e = act(g, seat, a)
        if (e) return err(e)
        break
      }
      case 'leave':
        if (seat >= 0) leave(g, seat)
        break
      case 'start':
        if (!isHost) return err('Only the host can start')
        if (!canStart(g)) return err('Need at least 2 players with chips')
        this.meta.autoDeal = true
        if (g.phase === 'lobby') { const e = startHand(g); if (e) return err(e) }
        break
      case 'pause':
        if (!isHost) return err('Only the host can pause')
        this.meta.autoDeal = false
        break
      case 'settings': {
        if (!isHost) return err('Only the host can change settings')
        if (g.phase !== 'lobby') return err('Change settings between games')
        const s = cleanSettings(msg.settings)
        if (!s) return err('Bad settings')
        g.settings = s
        for (const x of g.seats) if (x && g.handNo === 0) x.stack = s.startingStack
        break
      }
      case 'kick': {
        if (!isHost) return err('Only the host can remove players')
        if (typeof msg.seat === 'number' && msg.seat >= 0 && msg.seat < MAX_SEATS && msg.seat !== seat) leave(g, msg.seat)
        break
      }
      default:
        return
    }
    await this.commit()
  }

  async alarm() {
    const g = this.game
    const now = Date.now()
    if (g.phase === 'showdown' && this.meta.nextHandAt && now >= this.meta.nextHandAt - 50) {
      this.meta.nextHandAt = 0
      if (this.meta.autoDeal && canStart(g)) startHand(g)
      else { g.phase = 'lobby'; this.meta.autoDeal = false }
    } else if (g.toAct >= 0 && this.meta.turnDeadline && now >= this.meta.turnDeadline - 50) {
      const i = g.toAct
      const name = g.seats[i]?.name ?? 'Player'
      g.log.push(`${name} ran out of time`)
      const a: Action = g.phase === 'draw' ? { type: 'draw', discard: [] }
        : legal(g, i)?.canCheck ? { type: 'check' } : { type: 'fold' }
      act(g, i, a)
    }
    await this.commit()
  }

  /** Persist, refresh timers, and push each player their own view. */
  async commit() {
    const g = this.game
    const now = Date.now()
    const m = this.meta
    const key = g.toAct >= 0 ? `${g.handNo}:${g.phase}:${g.toAct}:${g.log.length}` : ''
    if (key !== m.turnKey) { m.turnKey = key; m.turnDeadline = key ? now + g.settings.turnSeconds * 1000 : 0 }
    if (g.phase === 'showdown' && !m.nextHandAt) m.nextHandAt = now + SHOWDOWN_MS
    if (g.phase !== 'showdown') m.nextHandAt = 0
    // a finished hand goes on the leaderboard exactly once
    if (g.phase === 'showdown' && g.results?.length && m.reportedHand !== g.handNo) {
      m.reportedHand = g.handNo
      try { await this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global')).record(g.results) }
      catch (e) { console.error('leaderboard record failed', e) } // never block the game on the leaderboard
    }
    const next = [m.turnDeadline, m.nextHandAt].filter(Boolean)
    if (next.length) await this.ctx.storage.setAlarm(Math.min(...next))
    else await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.put({ game: g, meta: m })
    for (const ws of this.ctx.getWebSockets()) this.sendState(ws, ws.deserializeAttachment()?.id ?? null)
  }

  sendState(ws: WebSocket, id: string | null) {
    send(ws, {
      t: 'state',
      view: viewFor(this.game, id),
      deadline: this.meta.turnDeadline || this.meta.nextHandAt,
      now: Date.now(),
      autoDeal: this.meta.autoDeal,
    })
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, 'bye') } catch { /* already closed */ }
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try { ws.send(JSON.stringify(msg)) } catch { /* socket gone; it reconnects */ }
}

function cleanName(v: unknown) {
  if (typeof v !== 'string') return null
  const n = v.replace(/\s+/g, ' ').trim().slice(0, 16)
  return n || null
}

function cleanAction(a: any): Action | null {
  if (!a || typeof a !== 'object') return null
  if (a.type === 'fold' || a.type === 'check' || a.type === 'call') return { type: a.type }
  if (a.type === 'raise' && Number.isFinite(a.to)) return { type: 'raise', to: a.to }
  if (a.type === 'draw' && Array.isArray(a.discard) && a.discard.length <= 5) return { type: 'draw', discard: a.discard.map(Number) }
  return null
}

function cleanSettings(s: any): Settings | null {
  if (!s || !(s.mode in MODES)) return null
  const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : null)
  const smallBlind = int(s.smallBlind, 1, 10000)
  const bigBlind = int(s.bigBlind, 2, 20000)
  const startingStack = int(s.startingStack, 100, 1000000)
  const turnSeconds = int(s.turnSeconds, 10, 120)
  if (!smallBlind || !bigBlind || !startingStack || !turnSeconds || bigBlind < smallBlind || startingStack < bigBlind * 2) return null
  return { mode: s.mode as Mode, smallBlind, bigBlind, startingStack, turnSeconds, rebuys: !!s.rebuys, risingBlinds: !!s.risingBlinds }
}

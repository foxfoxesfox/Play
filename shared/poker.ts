// Pure poker rules engine, shared by the Durable Object (authoritative) and the client (types only).

export type Mode = 'nlhe' | 'lhe' | 'draw5'
export const MODES: Record<Mode, string> = {
  nlhe: "No-Limit Hold'em",
  lhe: "Limit Hold'em",
  draw5: 'Five-Card Draw',
}
export type Card = string // rank + suit, e.g. "As", "Td", "9h"
export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'
export const MAX_SEATS = 9
export const BLIND_LEVEL_HANDS = 10
export const LIMIT_CAP = 4 // bet + 3 raises per street

export interface Settings {
  mode: Mode
  smallBlind: number
  bigBlind: number
  startingStack: number
  turnSeconds: number
  rebuys: boolean
  risingBlinds: boolean
}
export const DEFAULT_SETTINGS: Settings = {
  mode: 'nlhe', smallBlind: 10, bigBlind: 20, startingStack: 1000, turnSeconds: 30, rebuys: true, risingBlinds: false,
}

export interface Seat {
  id: string // private player token, never sent to other clients
  name: string
  stack: number
  hole: Card[]
  bet: number // this street
  committed: number // this hand
  folded: boolean
  allIn: boolean
  acted: boolean
  inHand: boolean
  drew: number | null
}

export type Phase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'bet1' | 'draw' | 'bet2' | 'showdown'

export interface Winner { seat: number; amount: number; hand: string; cards: Card[] }
/** One player's chip result for a finished hand: what they won minus what they put in. */
export interface HandResult { id: string; name: string; net: number; won: boolean; pot: number }

export interface Game {
  settings: Settings
  seats: (Seat | null)[]
  hostId: string | null
  phase: Phase
  handNo: number
  deck: Card[]
  board: Card[]
  button: number
  toAct: number
  currentBet: number
  minRaise: number
  betsThisStreet: number
  sb: number
  bb: number
  log: string[]
  winners: Winner[]
  showCards: boolean
  results?: HandResult[] // set when a hand finishes, for the leaderboard
  deadMoney?: number // chips from players who left mid-hand
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'draw'; discard: number[] }

export function newGame(settings: Settings = DEFAULT_SETTINGS): Game {
  return {
    settings, seats: Array(MAX_SEATS).fill(null), hostId: null, phase: 'lobby', handNo: 0, deck: [], board: [],
    button: -1, toAct: -1, currentBet: 0, minRaise: 0, betsThisStreet: 0, sb: settings.smallBlind, bb: settings.bigBlind,
    log: [], winners: [], showCards: false,
  }
}

export const fullDeck = (): Card[] => [...RANKS].flatMap(r => [...SUITS].map(s => r + s))

export function cryptoShuffle(cards: Card[]): Card[] {
  const a = [...cards]
  const r = new Uint32Array(a.length)
  crypto.getRandomValues(r)
  // shortcut: modulo bias is ~1e-8 for a 52-card deck, negligible for play chips
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const isHoldem = (g: Game) => g.settings.mode !== 'draw5'
const log = (g: Game, line: string) => { g.log.push(line); if (g.log.length > 60) g.log.shift() }

/** Next occupied seat clockwise from `from` (exclusive) matching `pred`, or -1. */
export function nextSeat(g: Game, from: number, pred: (s: Seat) => boolean): number {
  for (let k = 1; k <= MAX_SEATS; k++) {
    const i = (from + k + MAX_SEATS) % MAX_SEATS
    const s = g.seats[i]
    if (s && pred(s)) return i
  }
  return -1
}
const actionable = (s: Seat) => s.inHand && !s.folded && !s.allIn
const live = (s: Seat) => s.inHand && !s.folded

export function sit(g: Game, id: string, name: string, seat?: number): number | string {
  const taken = g.seats.some(s => s && s.id !== id && s.name.toLowerCase() === name.toLowerCase())
  if (taken) return `Someone called ${name} is already at this table. Pick another name.`
  const existing = g.seats.findIndex(s => s?.id === id)
  if (existing >= 0) { g.seats[existing]!.name = name; return existing }
  const idx = seat !== undefined && seat >= 0 && seat < MAX_SEATS && !g.seats[seat] ? seat : g.seats.findIndex(s => !s)
  if (idx < 0) return 'Table is full'
  g.seats[idx] = {
    id, name, stack: g.settings.startingStack, hole: [], bet: 0, committed: 0, folded: false, allIn: false,
    acted: false, inHand: false, drew: null,
  }
  g.hostId ??= id
  log(g, `${name} sat down`)
  return idx
}

/** Remove a player. Mid-hand they fold first so the pot stays correct. */
export function leave(g: Game, idx: number) {
  const s = g.seats[idx]
  if (!s) return
  if (live(s) && g.phase !== 'lobby' && g.phase !== 'showdown') {
    if (g.toAct === idx) act(g, idx, { type: 'fold' })
    else { s.folded = true; afterAction(g, idx) }
  }
  if (s.committed > 0 && g.phase !== 'lobby' && g.phase !== 'showdown') g.deadMoney = (g.deadMoney ?? 0) + s.committed
  g.seats[idx] = null
  log(g, `${s.name} left`)
  if (g.hostId === s.id) g.hostId = g.seats.find(x => x)?.id ?? null
  if (g.toAct === idx) g.toAct = nextSeat(g, idx, actionable)
}

export function canStart(g: Game) {
  return g.seats.filter(s => s && (s.stack > 0 || g.settings.rebuys)).length >= 2
}

export function startHand(g: Game, shuffle: (c: Card[]) => Card[] = cryptoShuffle): string | null {
  const st = g.settings
  const level = st.risingBlinds ? Math.floor(g.handNo / BLIND_LEVEL_HANDS) : 0
  g.sb = st.smallBlind * 2 ** level
  g.bb = st.bigBlind * 2 ** level
  for (const s of g.seats) {
    if (!s) continue
    if (s.stack === 0 && st.rebuys) { s.stack = st.startingStack; log(g, `${s.name} rebuys for ${st.startingStack}`) }
    Object.assign(s, { hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, drew: null, inHand: s.stack > 0 })
  }
  if (g.seats.filter(s => s?.inHand).length < 2) { g.phase = 'lobby'; return 'Need at least 2 players with chips' }

  g.handNo++
  g.deck = shuffle(fullDeck())
  g.board = []
  g.winners = []
  g.results = []
  g.showCards = false
  g.deadMoney = 0
  g.button = nextSeat(g, g.button, s => s.inHand)
  const n = isHoldem(g) ? 2 : 5
  for (let c = 0; c < n; c++) for (const s of g.seats) if (s?.inHand) s.hole.push(g.deck.pop()!)

  const headsUp = g.seats.filter(s => s?.inHand).length === 2
  const sbSeat = headsUp ? g.button : nextSeat(g, g.button, s => s.inHand)
  const bbSeat = nextSeat(g, sbSeat, s => s.inHand)
  log(g, `— hand #${g.handNo} · ${MODES[st.mode]} · blinds ${g.sb}/${g.bb}${level ? ' (level ' + (level + 1) + ')' : ''}`)
  put(g, sbSeat, g.sb); log(g, `${g.seats[sbSeat]!.name} posts small blind ${g.seats[sbSeat]!.bet}`)
  put(g, bbSeat, g.bb); log(g, `${g.seats[bbSeat]!.name} posts big blind ${g.seats[bbSeat]!.bet}`)
  g.currentBet = g.bb
  g.minRaise = g.bb
  g.betsThisStreet = 1
  g.phase = isHoldem(g) ? 'preflop' : 'bet1'
  g.toAct = nextSeat(g, bbSeat, actionable)
  if (roundDone(g)) nextStreet(g)
  return null
}

function put(g: Game, i: number, amount: number) {
  const s = g.seats[i]!
  const a = Math.min(amount, s.stack)
  s.stack -= a
  s.bet += a
  s.committed += a
  if (s.stack === 0) s.allIn = true
}

export interface Legal {
  canCheck: boolean
  callAmount: number
  canRaise: boolean
  minRaiseTo: number
  maxRaiseTo: number
}

export function legal(g: Game, i: number): Legal | null {
  const s = g.seats[i]
  if (!s || g.toAct !== i || !['preflop', 'flop', 'turn', 'river', 'bet1', 'bet2'].includes(g.phase)) return null
  const toCall = Math.min(g.currentBet - s.bet, s.stack)
  const maxTo = s.bet + s.stack
  if (g.settings.mode === 'lhe') {
    const size = g.phase === 'turn' || g.phase === 'river' ? g.bb * 2 : g.bb
    const to = Math.min(g.currentBet + size, maxTo)
    return { canCheck: toCall === 0, callAmount: toCall, canRaise: g.betsThisStreet < LIMIT_CAP && maxTo > g.currentBet, minRaiseTo: to, maxRaiseTo: to }
  }
  const minTo = Math.min(g.currentBet + g.minRaise, maxTo)
  return { canCheck: toCall === 0, callAmount: toCall, canRaise: maxTo > g.currentBet, minRaiseTo: minTo, maxRaiseTo: maxTo }
}

/** Apply an action. Returns an error message, or null on success. */
export function act(g: Game, i: number, a: Action): string | null {
  const s = g.seats[i]
  if (!s) return 'No such seat'
  if (g.toAct !== i) return 'Not your turn'

  if (g.phase === 'draw') {
    if (a.type !== 'draw') return 'Choose cards to draw'
    const idx = [...new Set(a.discard)].filter(k => Number.isInteger(k) && k >= 0 && k < s.hole.length)
    for (const k of idx) s.hole[k] = g.deck.pop()!
    s.drew = idx.length
    log(g, idx.length ? `${s.name} draws ${idx.length}` : `${s.name} stands pat`)
    g.toAct = nextSeat(g, i, x => live(x) && x.drew === null)
    if (g.toAct < 0) nextStreet(g)
    return null
  }

  const L = legal(g, i)
  if (!L) return 'You cannot act now'
  switch (a.type) {
    case 'fold':
      s.folded = true
      log(g, `${s.name} folds`)
      break
    case 'check':
      if (!L.canCheck) return `You need to call ${L.callAmount}`
      log(g, `${s.name} checks`)
      break
    case 'call':
      if (L.callAmount === 0) { log(g, `${s.name} checks`); break }
      put(g, i, L.callAmount)
      log(g, `${s.name} calls ${L.callAmount}${s.allIn ? ' (all-in)' : ''}`)
      break
    case 'raise': {
      if (!L.canRaise) return 'Raising is capped'
      const to = Math.floor(a.to)
      if (!(to >= L.minRaiseTo && to <= L.maxRaiseTo)) return `Raise must be between ${L.minRaiseTo} and ${L.maxRaiseTo}`
      const wasBet = g.currentBet === 0
      const increment = to - g.currentBet
      put(g, i, to - s.bet)
      if (increment >= g.minRaise) g.minRaise = increment
      g.currentBet = to
      g.betsThisStreet++
      // shortcut: a short all-in raise reopens action for everyone; strict rules only let them call/fold
      for (const o of g.seats) if (o && o !== s) o.acted = false
      log(g, `${s.name} ${wasBet ? 'bets' : 'raises to'} ${to}${s.allIn ? ' (all-in)' : ''}`)
      break
    }
    default:
      return 'Unknown action'
  }
  s.acted = true
  afterAction(g, i)
  return null
}

function afterAction(g: Game, i: number) {
  const alive = g.seats.map((s, k) => (s && live(s) ? k : -1)).filter(k => k >= 0)
  if (alive.length === 1) return award(g, [alive[0]], false)
  if (roundDone(g)) return nextStreet(g)
  g.toAct = nextSeat(g, i, actionable)
}

function roundDone(g: Game) {
  const act = g.seats.filter((s): s is Seat => !!s && actionable(s))
  if (act.length === 0) return true
  if (act.length === 1 && act[0].bet >= g.currentBet && g.seats.every(s => !s || !live(s) || s.allIn || s === act[0])) return true
  return act.every(s => s.acted && s.bet === g.currentBet)
}

function nextStreet(g: Game) {
  for (const s of g.seats) if (s) { s.bet = 0; s.acted = false }
  g.currentBet = 0
  g.minRaise = g.bb
  g.betsThisStreet = 0
  g.toAct = -1
  const order: Phase[] = isHoldem(g) ? ['preflop', 'flop', 'turn', 'river', 'showdown'] : ['bet1', 'draw', 'bet2', 'showdown']
  g.phase = order[order.indexOf(g.phase) + 1]
  if (g.phase === 'flop') g.board.push(g.deck.pop()!, g.deck.pop()!, g.deck.pop()!)
  if (g.phase === 'turn' || g.phase === 'river') g.board.push(g.deck.pop()!)
  if (g.board.length && isHoldem(g) && g.phase !== 'showdown') log(g, `${g.phase}: ${g.board.join(' ')}`)
  if (g.phase === 'showdown') return showdown(g)
  if (g.phase === 'draw') {
    g.toAct = nextSeat(g, g.button, live)
    return
  }
  g.toAct = nextSeat(g, g.button, actionable)
  if (roundDone(g)) nextStreet(g)
}

function showdown(g: Game) {
  const alive = g.seats.map((s, k) => (s && live(s) ? k : -1)).filter(k => k >= 0)
  award(g, alive, true)
}

/** Split committed chips into main/side pots and pay the best hand in each. */
function award(g: Game, contenders: number[], reveal: boolean) {
  g.phase = 'showdown'
  g.toAct = -1
  g.showCards = reveal && contenders.length > 1
  const scores = new Map(contenders.map(k => [k, bestHand(handCards(g, k))]))
  const contrib = g.seats.map(s => s?.committed ?? 0)
  const levels = [...new Set(contrib.filter(c => c > 0))].sort((a, b) => a - b)
  const won = new Map<number, number>()
  let prev = 0
  let dead = g.deadMoney ?? 0
  for (const lvl of levels) {
    let pot = contrib.reduce((sum, c) => sum + Math.max(0, Math.min(c, lvl) - prev), 0) + dead
    dead = 0
    const eligible = contenders.filter(k => contrib[k] >= lvl)
    prev = lvl
    if (!eligible.length) { // everyone who reached this level folded: give it to the best remaining hand
      eligible.push(...contenders)
    }
    let best: number[] = []
    for (const k of eligible) {
      const c = best.length ? compare(scores.get(k)!.score, scores.get(best[0])!.score) : 1
      if (c > 0) best = [k]
      else if (c === 0) best.push(k)
    }
    // odd chips go to the first winner clockwise from the button
    best.sort((a, b) => ((a - g.button + MAX_SEATS) % MAX_SEATS) - ((b - g.button + MAX_SEATS) % MAX_SEATS))
    const share = Math.floor(pot / best.length)
    let rem = pot - share * best.length
    for (const k of best) { won.set(k, (won.get(k) ?? 0) + share + (rem > 0 ? 1 : 0)); if (rem > 0) rem-- }
  }
  g.winners = []
  for (const [k, amt] of won) {
    const s = g.seats[k]!
    s.stack += amt
    const hand = reveal && contenders.length > 1 ? scores.get(k)!.name : ''
    // the winning five only when cards were actually shown; a fold-win reveals nothing
    g.winners.push({ seat: k, amount: amt, hand, cards: hand ? scores.get(k)!.cards : [] })
    log(g, `${s.name} wins ${amt}${hand ? ' with ' + hand.toLowerCase() : ''}`)
  }
  g.results = g.seats.flatMap((s, k) => {
    if (!s || !s.inHand) return []
    const amt = won.get(k) ?? 0
    return [{ id: s.id, name: s.name, net: amt - s.committed, won: amt > 0, pot: amt }]
  })
  for (const s of g.seats) if (s) { s.bet = 0 }
  g.deadMoney = 0
}

const handCards = (g: Game, k: number) => (isHoldem(g) ? [...g.seats[k]!.hole, ...g.board] : g.seats[k]!.hole)

// ---------- hand evaluation ----------
export const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']

export function eval5(cards: Card[]): number[] {
  const v = cards.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a)
  const flush = cards.every(c => c[1] === cards[0][1])
  const uniq = [...new Set(v)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0]
    else if (v[0] === 14 && v[1] === 5) straightHigh = 5 // wheel
  }
  const counts = new Map<number, number>()
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1)
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const ranks = groups.map(([r]) => r)
  const shape = groups.map(([, c]) => c).join('')
  if (straightHigh && flush) return [8, straightHigh]
  if (shape === '41') return [7, ...ranks]
  if (shape === '32') return [6, ...ranks]
  if (flush) return [5, ...v]
  if (straightHigh) return [4, straightHigh]
  if (shape === '311') return [3, ...ranks]
  if (shape === '221') return [2, ...ranks]
  if (shape === '2111') return [1, ...ranks]
  return [0, ...v]
}

export function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function bestHand(cards: Card[]): { score: number[]; name: string; cards: Card[] } {
  let best: number[] | null = null
  let five: Card[] = []
  const n = cards.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const hand = [cards[a], cards[b], cards[c], cards[d], cards[e]]
      const s = eval5(hand)
      if (!best || compare(s, best) > 0) { best = s; five = hand }
    }
  best ??= [0]
  return { score: best, name: HAND_NAMES[best[0]], cards: five }
}

/** The private player's token never leaves; others' cards only at a real showdown. */
export function viewFor(g: Game, playerId: string | null) {
  const me = g.seats.findIndex(s => s?.id === playerId)
  const pot = g.seats.reduce((t, s) => t + (s?.committed ?? 0), 0) + (g.deadMoney ?? 0)
  return {
    settings: g.settings,
    phase: g.phase,
    handNo: g.handNo,
    board: g.board,
    button: g.button,
    toAct: g.toAct,
    currentBet: g.currentBet,
    sb: g.sb,
    bb: g.bb,
    pot: g.phase === 'showdown' ? 0 : pot,
    log: g.log.slice(-30),
    winners: g.winners,
    me,
    isHost: !!playerId && g.hostId === playerId,
    hostSeat: g.seats.findIndex(s => s?.id === g.hostId),
    legal: me >= 0 ? legal(g, me) : null,
    seats: g.seats.map((s, k) =>
      s && {
        name: s.name, stack: s.stack, bet: s.bet, folded: s.folded, allIn: s.allIn, inHand: s.inHand, drew: s.drew,
        cardCount: s.hole.length,
        cards: k === me || (g.showCards && live(s)) ? s.hole : null,
        hand: (k === me || (g.showCards && live(s))) && handCards(g, k).length >= 5 ? bestHand(handCards(g, k)).name : null,
      },
    ),
  }
}
export type View = ReturnType<typeof viewFor>
export type SeatView = NonNullable<View['seats'][number]>

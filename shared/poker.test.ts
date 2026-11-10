import { describe, expect, it } from 'vitest'
import { act, bestHand, compare, eval5, fullDeck, legal, newGame, sit, startHand, DEFAULT_SETTINGS, type Card, type Game, type Mode } from './poker'

/** Shuffle stub: the deck pops cards in exactly this order, then the rest. */
const rig = (order: Card[]) => () => {
  const rest = fullDeck().filter(c => !order.includes(c))
  return [...rest, ...[...order].reverse()]
}
const total = (g: Game) => g.seats.reduce((t, s) => t + (s ? s.stack + s.committed : 0), 0)
const chips = (g: Game) => g.seats.reduce((t, s) => t + (s?.stack ?? 0), 0)

function table(stacks: number[], mode: Mode = 'nlhe', extra = {}) {
  const g = newGame({ ...DEFAULT_SETTINGS, mode, rebuys: false, ...extra })
  stacks.forEach((st, i) => { sit(g, 'p' + i, 'P' + i); g.seats[i]!.stack = st })
  return g
}

describe('hand evaluation', () => {
  it('ranks categories in order', () => {
    const hands = [
      ['2s', '5d', '9h', 'Jc', 'Kd'], ['2s', '2d', '9h', 'Jc', 'Kd'], ['2s', '2d', '9h', '9c', 'Kd'],
      ['2s', '2d', '2h', 'Jc', 'Kd'], ['As', '2d', '3h', '4c', '5d'], ['2s', '5s', '9s', 'Js', 'Ks'],
      ['2s', '2d', '2h', 'Kc', 'Kd'], ['2s', '2d', '2h', '2c', 'Kd'], ['9s', 'Ts', 'Js', 'Qs', 'Ks'],
    ]
    const scores = hands.map(eval5)
    scores.forEach((s, i) => expect(s[0]).toBe(i))
  })
  it('wheel loses to six-high straight; kickers decide pairs', () => {
    expect(compare(eval5(['As', '2d', '3h', '4c', '5d']), eval5(['2s', '3d', '4h', '5c', '6d']))).toBeLessThan(0)
    expect(compare(eval5(['As', 'Ad', '3h', '4c', 'Kd']), eval5(['Ac', 'Ah', '3s', '4d', 'Qd']))).toBeGreaterThan(0)
  })
  it('picks best 5 of 7', () => {
    expect(bestHand(['Ah', 'Kh', 'Qh', 'Jh', 'Th', '2c', '2d']).name).toBe('Straight flush')
  })
})

describe('no-limit hold\'em', () => {
  it('heads-up fold gives blinds to big blind', () => {
    const g = table([1000, 1000])
    startHand(g)
    // heads-up: button is small blind and acts first
    expect(g.toAct).toBe(g.button)
    expect(act(g, g.toAct, { type: 'fold' })).toBeNull()
    expect(g.phase).toBe('showdown')
    expect(chips(g)).toBe(2000)
    expect(g.seats[g.button]!.stack).toBe(990)
  })

  it('builds a side pot when a short stack is all-in', () => {
    const g = table([100, 300, 300])
    startHand(g, rig(['Ac', 'Kc', 'Qc', 'Ad', 'Kd', 'Qd', '2c', '7d', '9h', '3s', '4d']))
    expect(g.toAct).toBe(0)
    expect(act(g, 0, { type: 'raise', to: 100 })).toBeNull()
    expect(act(g, 1, { type: 'call' })).toBeNull()
    expect(act(g, 2, { type: 'call' })).toBeNull()
    expect(g.phase).toBe('flop')
    expect(act(g, 1, { type: 'raise', to: 100 })).toBeNull()
    expect(act(g, 2, { type: 'call' })).toBeNull()
    for (const street of ['turn', 'river']) {
      expect(g.phase).toBe(street)
      expect(act(g, 1, { type: 'check' })).toBeNull()
      expect(act(g, 2, { type: 'check' })).toBeNull()
    }
    expect(g.phase).toBe('showdown')
    expect(g.seats.filter(s => s).map(s => s!.stack)).toEqual([300, 300, 100])
  })

  it('splits a tied pot', () => {
    const g = table([1000, 1000])
    // both play the board (royal flush on board)
    startHand(g, rig(['2c', '3d', '2d', '3c', 'Ah', 'Kh', 'Qh', 'Jh', 'Th']))
    act(g, g.toAct, { type: 'call' })
    act(g, g.toAct, { type: 'check' })
    while (g.phase !== 'showdown') act(g, g.toAct, { type: 'check' })
    expect(g.seats.filter(s => s).map(s => s!.stack)).toEqual([1000, 1000])
  })

  it('rejects out-of-turn and undersized raises', () => {
    const g = table([1000, 1000, 1000])
    startHand(g)
    const other = (g.toAct + 1) % 3
    expect(act(g, other, { type: 'fold' })).toBe('Not your turn')
    expect(act(g, g.toAct, { type: 'raise', to: 30 })).toMatch(/between 40/)
  })
})

describe('names', () => {
  it('rejects a duplicate name at the same table, ignoring case', () => {
    const g = table([1000])
    expect(sit(g, 'other-player', 'p0')).toMatch(/already at this table/)
    expect(sit(g, 'p0', 'P0')).toBe(0) // you can keep your own name
  })
})

describe('limit hold\'em', () => {
  it('uses fixed sizes and caps at four bets', () => {
    const g = table([1000, 1000, 1000], 'lhe')
    startHand(g)
    expect(legal(g, g.toAct)!.minRaiseTo).toBe(40)
    act(g, g.toAct, { type: 'raise', to: 40 })
    act(g, g.toAct, { type: 'raise', to: 60 })
    act(g, g.toAct, { type: 'raise', to: 80 })
    expect(legal(g, g.toAct)!.canRaise).toBe(false)
    expect(act(g, g.toAct, { type: 'raise', to: 100 })).toBe('Raising is capped')
  })
})

describe('five-card draw', () => {
  it('runs bet → draw → bet → showdown', () => {
    const g = table([1000, 1000], 'draw5')
    startHand(g)
    expect(g.phase).toBe('bet1')
    expect(g.seats[0]!.hole).toHaveLength(5)
    act(g, g.toAct, { type: 'call' })
    act(g, g.toAct, { type: 'check' })
    expect(g.phase).toBe('draw')
    const first = g.toAct
    const before = [...g.seats[first]!.hole]
    expect(act(g, first, { type: 'draw', discard: [0, 1, 1, 9] })).toBeNull()
    expect(g.seats[first]!.drew).toBe(2)
    expect(g.seats[first]!.hole.slice(2)).toEqual(before.slice(2))
    act(g, g.toAct, { type: 'draw', discard: [] })
    expect(g.phase).toBe('bet2')
    act(g, g.toAct, { type: 'check' })
    act(g, g.toAct, { type: 'check' })
    expect(g.phase).toBe('showdown')
    expect(chips(g)).toBe(2000)
  })
})

describe('fuzz', () => {
  it('never creates or loses chips across many random hands', () => {
    for (const mode of ['nlhe', 'lhe', 'draw5'] as Mode[]) {
      const g = table([500, 800, 300, 1200, 50], mode, { rebuys: true })
      for (let h = 0; h < 200; h++) {
        if (startHand(g)) break
        const start = total(g)
        let guard = 0
        while (g.phase !== 'showdown' && guard++ < 500) {
          const i = g.toAct
          expect(i).toBeGreaterThanOrEqual(0)
          if (g.phase === 'draw') { act(g, i, { type: 'draw', discard: [0, 2].slice(0, h % 3) }); continue }
          const L = legal(g, i)!
          const r = Math.random()
          const a = r < 0.15 ? { type: 'fold' as const }
            : r < 0.35 && L.canRaise ? { type: 'raise' as const, to: L.minRaiseTo + Math.floor(Math.random() * (L.maxRaiseTo - L.minRaiseTo + 1)) }
            : { type: L.canCheck ? 'check' as const : 'call' as const }
          expect(act(g, i, a)).toBeNull()
        }
        expect(g.phase).toBe('showdown')
        expect(chips(g)).toBe(start)
        // leaderboard results: every chip won was lost by someone
        expect(g.results!.reduce((t, r) => t + r.net, 0)).toBe(0)
      }
    }
  })
})

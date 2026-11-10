import { DurableObject } from 'cloudflare:workers'
import type { HandResult } from '../shared/poker'
import type { Env } from './index'

export interface BoardRow { name: string; net: number; hands: number; wins: number; best: number }
export interface Board { winners: BoardRow[]; losers: BoardRow[] }

/** One site-wide leaderboard. Rows are keyed by the private player token, which never leaves this object. */
export class Leaderboard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      net INTEGER NOT NULL DEFAULT 0,
      hands INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      best INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL
    )`)
  }

  record(results: HandResult[]) {
    const now = Date.now()
    for (const r of results) {
      this.ctx.storage.sql.exec(
        `INSERT INTO players (id, name, net, hands, wins, best, updated) VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, net = net + excluded.net, hands = hands + 1,
           wins = wins + excluded.wins, best = MAX(best, excluded.best), updated = excluded.updated`,
        r.id, r.name, r.net, r.won ? 1 : 0, r.pot, now,
      )
    }
  }

  top(limit = 10): Board {
    const rows = (order: string, where: string) =>
      this.ctx.storage.sql
        .exec<Record<string, SqlStorageValue>>(`SELECT name, net, hands, wins, best FROM players WHERE ${where} ORDER BY net ${order}, hands DESC LIMIT ?`, limit)
        .toArray() as unknown as BoardRow[]
    return { winners: rows('DESC', 'net > 0'), losers: rows('ASC', 'net < 0') }
  }
}

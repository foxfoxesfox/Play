import { Leaderboard } from './leaderboard'
import { Table } from './table'

export { Leaderboard, Table }

export interface Env {
  TABLE: DurableObjectNamespace<Table>
  LEADERBOARD: DurableObjectNamespace<Leaderboard>
  ASSETS: Fetcher
}

const WORDS = ['fox', 'owl', 'cat', 'elk', 'yak', 'emu', 'koi', 'ram', 'bee', 'ant', 'cod', 'jay']

function tableCode() {
  const r = crypto.getRandomValues(new Uint32Array(2))
  return `${WORDS[r[0] % WORDS.length]}-${(r[1] % 900000) + 100000}`
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/tables' && req.method === 'POST') return Response.json({ code: tableCode() })
    if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
      const board = await env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global')).top()
      return Response.json(board, { headers: { 'Cache-Control': 'public, max-age=15' } })
    }
    const m = url.pathname.match(/^\/api\/tables\/([a-z]{3}-\d{6})\/ws$/)
    if (m) return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(req)
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

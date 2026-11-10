import { Table } from './table'

export { Table }

export interface Env {
  TABLE: DurableObjectNamespace<Table>
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
    const m = url.pathname.match(/^\/api\/tables\/([a-z]{3}-\d{6})\/ws$/)
    if (m) return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(req)
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

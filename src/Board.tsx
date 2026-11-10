import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { rowsIn } from './motion'

interface Row { name: string; net: number; hands: number; wins: number; best: number }
interface Board { winners: Row[]; losers: Row[] }

/** Biggest winners and losers across every table, in play chips. */
export function Leaderboard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    let live = true
    fetch('/api/leaderboard')
      .then(r => (r.ok ? (r.json() as Promise<Board>) : Promise.reject()))
      .then((b: Board) => live && setBoard(b))
      .catch(() => live && setFailed(true))
    return () => { live = false }
  }, [])

  useLayoutEffect(() => {
    if (board && ref.current) rowsIn([...ref.current.querySelectorAll('.board-list li')])
  }, [board])

  return (
    <section className="leaderboard" aria-labelledby="lb-title" ref={ref}>
      <h2 id="lb-title">Leaderboard</h2>
      <p className="leaderboard__lede">Play chips won and lost across every table, all time.</p>
      {failed ? (
        <p className="leaderboard__empty">The leaderboard didn't load. Refresh to try again.</p>
      ) : (
        <div className="leaderboard__cols">
          <List title="biggest winners" rows={board?.winners} sign="+" />
          <List title="biggest losers" rows={board?.losers} sign="" />
        </div>
      )}
    </section>
  )
}

function List({ title, rows, sign }: { title: string; rows?: Row[]; sign: string }) {
  return (
    <div className="receipt board-col">
      <h3 className="log__title">{title}</h3>
      {!rows ? (
        <p className="leaderboard__empty">Counting chips…</p>
      ) : !rows.length ? (
        <p className="leaderboard__empty">Nobody yet. Play a few hands.</p>
      ) : (
        <ol className="board-list">
          {rows.map((r, i) => (
            <li key={r.name + i}>
              <span className="board-list__rank">{i + 1}</span>
              <span className="board-list__name">
                {r.name}
                <small>{r.hands} hand{r.hands === 1 ? '' : 's'} · {r.wins} won</small>
              </span>
              <b className="num">{sign}{r.net.toLocaleString()}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

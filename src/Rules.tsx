import { BLIND_LEVEL_HANDS, MODES, type Mode, type Settings } from '../shared/poker'
import { useRef } from 'react'
import { Card } from './Card'
import { centre, flipClose, flipOpen, rowsIn } from './motion'

// Plain-language rules for people who don't play much poker.
export const MODE_INFO: Record<Mode, { tagline: string; how: string; betting: string }> = {
  nlhe: {
    tagline: 'The classic. Any bet, up to all your chips.',
    how: "You get 2 private cards. 5 shared cards are turned face up in the middle (3, then 1, then 1). Make the best 5-card hand from your 2 and the shared 5.",
    betting: 'Bet any amount from one big blind up to everything you have, so one hand can win or lose it all. Big swings, bold bluffs.',
  },
  lhe: {
    tagline: "Same cards, fixed bet sizes. Calmer.",
    how: "Played exactly like No-Limit Hold'em: 2 private cards plus 5 shared ones.",
    betting: 'Every bet is a set size: one big blind in the first two rounds, two big blinds in the last two, and at most 4 bets per round. Nobody can go all-in out of nowhere, so games last longer.',
  },
  draw5: {
    tagline: 'Kitchen-table poker. Swap cards once.',
    how: 'No shared cards. You get 5 private cards, everyone bets, then you swap any of your cards for new ones once, then everyone bets again.',
    betting: 'Bet any amount up to all your chips, like No-Limit. The fun is in guessing what people swapped for.',
  },
}

export const SETTING_HINT = {
  blinds: 'Blinds are two small forced bets that rotate around the table each hand, so there is always something to win. They set the stakes: the big blind is the smallest bet you can make.',
  startingStack: 'Play chips everyone sits down with. Not real money.',
  turnSeconds: 'How long each player has to act. When time runs out you check if you can, otherwise you fold.',
}

/** "50 big blinds each: short and swingy" — the one number that says how deep the game is. */
export function depth(s: Settings) {
  const bbs = Math.floor(s.startingStack / Math.max(1, s.bigBlind))
  const feel = bbs < 40 ? 'short and swingy' : bbs <= 120 ? 'a normal game' : 'long and careful'
  return { bbs, line: `Everyone starts with ${bbs} big blinds: ${feel}.` }
}

/** Empty table: show every game so nobody thinks there is only one. */
export function GameChoices() {
  return (
    <section className="receipt rules js-panel" aria-label="Games you can play">
      <h2 className="log__title">three ways to play</h2>
      <ul className="choices">
        {(Object.keys(MODES) as Mode[]).map(m => (
          <li key={m}><b>{MODES[m]}</b><span>{MODE_INFO[m].tagline}</span></li>
        ))}
      </ul>
      <p className="hint">The first person to sit down hosts the table and picks the game, the stakes and the turn timer.</p>
    </section>
  )
}

/** Read-only summary of the table's rules, for players who aren't hosting. */
export function TableRules({ s }: { s: Settings }) {
  const info = MODE_INFO[s.mode]
  return (
    <section className="receipt rules js-panel" aria-label="Table rules">
      <h2 className="log__title">tonight's game</h2>
      <p className="rules__mode">{MODES[s.mode]}</p>
      <p className="hint">The host picked this from No-Limit Hold'em, Limit Hold'em and Five-Card Draw.</p>
      <p>{info.how}</p>
      <p>{info.betting}</p>
      <dl className="rules__facts">
        <dt>Stakes</dt><dd>{s.smallBlind}/{s.bigBlind} blinds</dd>
        <dt>Chips</dt><dd>{s.startingStack.toLocaleString()} each ({depth(s).bbs} big blinds)</dd>
        <dt>Turn timer</dt><dd>{s.turnSeconds} seconds</dd>
        <dt>Rebuys</dt><dd>{s.rebuys ? 'On: run out and you get a fresh stack' : 'Off: run out and you are out'}</dd>
        <dt>Blinds</dt><dd>{s.risingBlinds ? `Double every ${BLIND_LEVEL_HANDS} hands` : 'Stay the same'}</dd>
      </dl>
    </section>
  )
}

const HANDS: [string, string, string[]][] = [
  ['Straight flush', 'Five in a row, same suit', ['9h', 'Th', 'Jh', 'Qh', 'Kh']],
  ['Four of a kind', 'Four cards of one rank', ['7s', '7h', '7d', '7c', 'Kd']],
  ['Full house', 'Three of a kind plus a pair', ['Qs', 'Qh', 'Qd', '4c', '4d']],
  ['Flush', 'Any five of the same suit', ['2d', '6d', '9d', 'Jd', 'Ad']],
  ['Straight', 'Five in a row, any suits', ['5c', '6d', '7h', '8s', '9c']],
  ['Three of a kind', 'Three cards of one rank', ['8s', '8h', '8d', 'Kc', '3d']],
  ['Two pair', 'Two different pairs', ['Js', 'Jd', '4h', '4c', 'As']],
  ['Pair', 'Two cards of one rank', ['Ts', 'Th', '6d', '3c', 'Kh']],
  ['High card', 'None of the above: highest card plays', ['As', 'Jd', '8h', '5c', '2s']],
]

/** Which hands beat which: a small button that opens the guide as a playing card,
 *  flying out of the button back-first and flipping over to its face. */
export function HandGuide() {
  const btnRef = useRef<HTMLButtonElement>(null)
  const dlgRef = useRef<HTMLDialogElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)

  const open = () => {
    const dlg = dlgRef.current
    if (!dlg || dlg.open) return
    dlg.showModal()
    const card = cardRef.current!
    flipOpen(card, centre(btnRef.current!))
    rowsIn([...card.querySelectorAll('.guide__list li')], 260)
  }
  const close = () => {
    const dlg = dlgRef.current
    if (!dlg?.open || closing.current) return
    closing.current = true
    flipClose(cardRef.current!, centre(btnRef.current!), () => { dlg.close(); closing.current = false; btnRef.current?.focus() })
  }

  return (
    <>
      <button ref={btnRef} className="table-tool table-tool--guide" onClick={open} aria-haspopup="dialog">
        <span className="guide-btn__cards" aria-hidden="true"><Card card="Ah" /><Card card="Kh" /></span>
        which hands win?
      </button>
      <dialog
        ref={dlgRef}
        className="guide-dlg"
        aria-labelledby="guide-title"
        onCancel={e => { e.preventDefault(); close() }}
        onClick={e => { if (e.target === e.currentTarget) close() }}
      >
        <div className="guide-card" ref={cardRef}>
          <div className="guide-card__face">
            <div className="guide-card__head">
              <h2 id="guide-title">Which hands win?</h2>
              <button className="pill pill--btn" onClick={close} autoFocus>Close</button>
            </div>
            <ol className="guide__list">
              {HANDS.map(([name, desc, cards]) => (
                <li key={name}>
                  <div className="guide__cards" aria-hidden="true">{cards.map(c => <Card key={c} card={c} />)}</div>
                  <div><b>{name}</b><span>{desc}</span></div>
                </li>
              ))}
            </ol>
            <p className="guide__note">Higher on the list beats lower. Ties go to the higher cards; exact ties split the pot.</p>
          </div>
          <div className="guide-card__back" aria-hidden="true" />
        </div>
      </dialog>
    </>
  )
}

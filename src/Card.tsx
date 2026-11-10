import type { CSSProperties } from 'react'

// Original hand-drawn deck: 100x140 viewBox, ink lines run through the shared #wobble filter.

const SUIT_PATH: Record<string, string> = {
  h: 'M12 21.5C5.5 16 2 12 2 7.6 2 4.5 4.4 2.4 7.1 2.5 9.2 2.6 11 4 12 6.1 13 4 14.8 2.6 16.9 2.5 19.6 2.4 22 4.5 22 7.6 22 12 18.5 16 12 21.5Z',
  d: 'M12 1.8Q15.4 7 20.4 12 15.4 17 12 22.2 8.6 17 3.6 12 8.6 7 12 1.8Z',
  s: 'M12 2C9.2 6.6 3 9.8 3 14.2 3 17.1 5.4 18.7 7.9 18.2 9.5 17.9 10.5 17 11.1 15.9 10.9 18.6 10.1 20.6 8.4 22H15.6C13.9 20.6 13.1 18.6 12.9 15.9 13.5 17 14.5 17.9 16.1 18.2 18.6 18.7 21 17.1 21 14.2 21 9.8 14.8 6.6 12 2Z',
  c: 'M12 2.6A4.3 4.3 0 0 0 8.4 9.3 4.3 4.3 0 1 0 10.9 16.2C10.7 18.7 10 20.6 8.4 22H15.6C14 20.6 13.3 18.7 13.1 16.2A4.3 4.3 0 1 0 15.6 9.3 4.3 4.3 0 0 0 12 2.6Z',
}
export const SUIT_NAME: Record<string, string> = { h: 'hearts', d: 'diamonds', s: 'spades', c: 'clubs' }
const RANK_NAME: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' }
const red = (s: string) => s === 'h' || s === 'd'

// pip centres for 2–10 (x, y); pips below the middle are drawn upside down
const PIPS: Record<string, [number, number][]> = {
  '2': [[50, 32], [50, 108]],
  '3': [[50, 32], [50, 70], [50, 108]],
  '4': [[32, 32], [68, 32], [32, 108], [68, 108]],
  '5': [[32, 32], [68, 32], [50, 70], [32, 108], [68, 108]],
  '6': [[32, 32], [68, 32], [32, 70], [68, 70], [32, 108], [68, 108]],
  '7': [[32, 32], [68, 32], [50, 51], [32, 70], [68, 70], [32, 108], [68, 108]],
  '8': [[32, 32], [68, 32], [50, 51], [32, 70], [68, 70], [50, 89], [32, 108], [68, 108]],
  '9': [[32, 30], [68, 30], [32, 56], [68, 56], [50, 70], [32, 84], [68, 84], [32, 110], [68, 110]],
  T: [[32, 30], [68, 30], [50, 43], [32, 56], [68, 56], [32, 84], [68, 84], [50, 97], [32, 110], [68, 110]],
}

// little doodled headwear for the court cards
const COURT: Record<string, string> = {
  K: 'M28 62L32 40 42 52 50 34 58 52 68 40 72 62Z M30 68H70',
  Q: 'M30 62Q36 44 42 54 46 40 50 50 54 40 58 54 64 44 70 62Z M30 68H70 M50 50V44',
  J: 'M30 64Q34 42 50 40Q66 38 72 52L60 56Q56 48 50 50Q40 52 38 64Z M30 68H70 M72 52Q80 50 82 44',
}

function Suit({ s, x, y, size, flip }: { s: string; x: number; y: number; size: number; flip?: boolean }) {
  const k = size / 24
  return (
    <path
      d={SUIT_PATH[s]}
      transform={`translate(${x - 12 * k} ${y - 12 * k}) scale(${k})${flip ? ' rotate(180 12 12)' : ''}`}
    />
  )
}

export function Card({ card, back, selected, className = '', style, onClick, order }: {
  card?: string | null; back?: boolean; selected?: boolean; className?: string; style?: CSSProperties; onClick?: () => void; order?: number
}) {
  const faceDown = back || !card
  const label = faceDown ? 'Face-down card' : `${RANK_NAME[card[0]] ?? card[0]} of ${SUIT_NAME[card[1]]}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`card${faceDown ? ' card--back' : ''}${selected ? ' card--selected' : ''} ${className}`}
      style={style}
      onClick={onClick}
      aria-label={label}
      aria-pressed={onClick ? !!selected : undefined}
      role={onClick ? undefined : 'img'}
      data-order={order}
    >
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <rect x="3" y="3" width="94" height="134" rx="11" className="card__edge" filter="url(#wobble)" />
        {faceDown ? <Back /> : <Face card={card} />}
      </svg>
    </Tag>
  )
}

function Face({ card }: { card: string }) {
  const [r, s] = card
  const rank = r === 'T' ? '10' : r
  const court = r in COURT
  return (
    <g className={red(s) ? 'ink-red' : 'ink'} filter="url(#wobble)">
      <text x="12" y="26" className="card__rank">{rank}</text>
      <Suit s={s} x={18} y={38} size={12} />
      <g transform="rotate(180 50 70)">
        <text x="12" y="26" className="card__rank">{rank}</text>
        <Suit s={s} x={18} y={38} size={12} />
      </g>
      {r === 'A' && <Suit s={s} x={50} y={70} size={44} />}
      {PIPS[r]?.map(([x, y], i) => <Suit key={i} s={s} x={x} y={y} size={19} flip={y > 72} />)}
      {court && (
        <g className="card__court">
          <path d={COURT[r]} />
          <text x="50" y="104" className="card__court-rank">{rank}</text>
          <Suit s={s} x={50} y={84} size={16} />
        </g>
      )}
    </g>
  )
}

function Back() {
  return (
    <g className="card__back-art">
      <rect x="11" y="11" width="78" height="118" rx="6" fill="url(#hatch)" />
      <rect x="11" y="11" width="78" height="118" rx="6" fill="none" filter="url(#wobble)" />
      {/* a doodled tea cup: the counter this table runs like */}
      <g filter="url(#wobble)" transform="translate(30 50)">
        <rect x="0" y="0" width="40" height="40" rx="4" fill="#fff" stroke="none" />
        <path d="M6 10H34L31 36Q30 38 28 38H12Q10 38 9 36Z" fill="#fff" />
        <path d="M4 10H36M20 10L26 1" />
        <circle cx="15" cy="30" r="2" fill="currentColor" />
        <circle cx="21" cy="32" r="2" fill="currentColor" />
        <circle cx="26" cy="29" r="2" fill="currentColor" />
      </g>
    </g>
  )
}

/** Shared SVG defs: the hand-drawn wobble filter and the card-back hatch. Render once. */
export function InkDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#141414" strokeWidth="1.6" />
        </pattern>
      </defs>
    </svg>
  )
}

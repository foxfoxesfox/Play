import { useImperativeHandle, useRef, type Ref } from 'react'
import { Card } from './Card'
import { centre, flick, look, riffle } from './motion'

export interface DealerApi {
  deck: () => HTMLElement | null
  shuffle: () => void
  flick: () => void
  lookAt: (p: { x: number; y: number } | null) => void
}

/** The drawn dealer in a striped visor, sitting at the top of the table with the deck in front. */
export function Dealer({ ref }: { ref: Ref<DealerApi> }) {
  const deckRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<SVGGElement>(null)
  const eyesRef = useRef<SVGGElement>(null)

  useImperativeHandle(ref, () => ({
    deck: () => deckRef.current,
    shuffle: () => riffle(leftRef.current, rightRef.current),
    flick: () => flick(handRef.current),
    lookAt: p => {
      const eyes = eyesRef.current
      if (!eyes) return
      if (!p) return look(eyes, 0, 0)
      const c = centre(eyes)
      const dx = p.x - c.x, dy = p.y - c.y
      const len = Math.hypot(dx, dy) || 1
      look(eyes, (dx / len) * 3, (dy / len) * 2.2)
    },
  }), [])

  return (
    <>
      <svg className="dealer" viewBox="0 0 160 124" aria-hidden="true">
        <g filter="url(#wobble)">
          {/* shoulders and bow tie */}
          <path className="d-paper" d="M34 124 Q36 76 80 70 Q124 76 126 124" />
          <path className="d-ink-fill" d="M68 70 L80 77 L68 84 Z M92 70 L80 77 L92 84 Z" />
          <circle className="d-ink-fill" cx="80" cy="77" r="3" />
          {/* head */}
          <circle className="d-paper" cx="80" cy="42" r="23" />
          <g ref={eyesRef}>
            <circle className="d-ink-fill" cx="72" cy="45" r="2.8" />
            <circle className="d-ink-fill" cx="88" cy="45" r="2.8" />
          </g>
          <path className="d-ink" d="M74 54 Q80 58 86 54" />
          {/* the dealer's visor */}
          <path className="d-visor" d="M55 35 Q80 12 105 35 Q80 28 55 35 Z" />
          <path className="d-ink" d="M52 37 Q80 47 108 37" />
          {/* left arm resting, right arm deals */}
          <path className="d-ink" d="M46 98 Q50 112 62 116" />
          <circle className="d-paper" cx="64" cy="116" r="6.5" />
          <g ref={handRef} className="dealer__hand">
            <path className="d-ink" d="M114 98 Q110 112 98 116" />
            <circle className="d-paper" cx="96" cy="116" r="6.5" />
          </g>
        </g>
      </svg>
      <div className="deck" ref={deckRef}>
        <div className="deck__half" ref={leftRef}><Card back /><Card back /></div>
        <div className="deck__half" ref={rightRef}><Card back /><Card back /></div>
      </div>
    </>
  )
}

// Table sound effects (CC0 clips in /public/sounds, credits there). Web Audio so overlapping deals stay crisp.

export type Sfx = 'shuffle' | 'deal' | 'flip' | 'chips' | 'win' | 'knock' | 'turn' | 'tick'

const FILES = ['shuffle', 'deal1', 'deal2', 'deal3', 'flip', 'chips', 'win', 'knock', 'turn', 'tick']
const VOLUME: Record<Sfx, number> = { shuffle: 0.6, deal: 0.45, flip: 0.5, chips: 0.55, win: 0.7, knock: 0.6, turn: 0.45, tick: 0.3 }
const KEY = 'play.sound'

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let muted = (() => { try { return localStorage.getItem(KEY) === 'off' } catch { return false } })()
let dealTurn = 0

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem(KEY, m ? 'off' : 'on') } catch { /* private mode */ }
}

// browsers only allow audio after a user gesture, so the context starts on the first tap or key
function unlock() {
  if (ctx) return
  ctx = new AudioContext()
  for (const f of FILES) {
    fetch(`/sounds/${f}.mp3`)
      .then(r => r.arrayBuffer())
      .then(b => ctx!.decodeAudioData(b))
      .then(buf => buffers.set(f, buf))
      .catch(() => { /* a missing clip just stays silent */ })
  }
}
addEventListener('pointerdown', unlock, { once: true })
addEventListener('keydown', unlock, { once: true })

export function sfx(name: Sfx, volume = 1) {
  if (muted || !ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const file = name === 'deal' ? `deal${(dealTurn++ % 3) + 1}` : name
  const buf = buffers.get(file)
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = 0.95 + Math.random() * 0.1 // small pitch drift so repeats don't sound copied
  const gain = ctx.createGain()
  gain.gain.value = VOLUME[name] * volume
  src.connect(gain).connect(ctx.destination)
  src.start()
}

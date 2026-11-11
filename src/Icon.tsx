// Hand-drawn icon set: one 2px round stroke, drawn on a 24px grid.
const PATHS = {
  pencil: 'M4 20l1.2-4.6L16 4.6a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z M14.5 6l3.5 3.5',
  link: 'M10 14a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2 M14 10a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2',
  check: 'M5 12.5l4.5 4.5L19 7',
  crown: 'M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  menu: 'M4 7h16 M4 12h16 M4 17h10',
  sound: 'M4 9.5h3l4.5-4v13l-4.5-4H4z M15 9a4 4 0 0 1 0 6 M17.5 6.5a7.5 7.5 0 0 1 0 11',
  soundOff: 'M4 9.5h3l4.5-4v13l-4.5-4H4z M15.5 9.5l5 5 M20.5 9.5l-5 5',
} as const

export function Icon({ name, title }: { name: keyof typeof PATHS; title?: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={PATHS[name]} />
    </svg>
  )
}

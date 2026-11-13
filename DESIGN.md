---
name: play
description: A hand-drawn game table for one friend group. Poker first.
colors:
  paper: "#ffffff"
  ink: "#141414"
  ink-soft: "#595959"
  ink-mute: "#a8a8a8"
  ink-faint: "#e6e6e6"
  suit-red: "#c8372d"
  highlighter: "#ffe14d"
typography:
  display:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "clamp(44px, 7vw, 92px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "clamp(28px, 3vw, 38px)"
    fontWeight: 800
  title:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  hint:
    fontFamily: "'Shantell Sans', 'Comic Sans MS', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  ticket: "4px"
  input: "10px"
  sticker: "14px"
  card-box: "22px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 3vw, 32px)"
  bar-h: "57px"
  panel-gap: "16px"
  control-gap: "10px"
components:
  sticker:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sticker}"
    padding: "11px 16px"
  sticker-main:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sticker}"
    padding: "11px 16px"
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  pill-hover:
    backgroundColor: "{colors.ink-faint}"
  pill-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ticket}"
    padding: "2px 8px"
  ticket-now:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
  ticket-won:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  receipt:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "10px 14px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "9px 12px"
---

# Design System: play

## Overview

**North star: the tea-shop counter.** The table runs like a counter where orders are called: whose turn it is gets called out like an order number, the pot is a receipt slip, and every player has a name ticket. It is drawn by hand in black ink on white paper, in the spirit of HEYTEA's line art and foxesvx.dev. It refuses the casino client: no green felt, no gold chips, no neon, no photo avatars.

Everything is one wobbly ink line on paper. Structure comes from 2 to 2.5px ink borders, not from fills. Colour is almost absent, so the two colours that exist mean something: red is a suit, yellow is "act here".

The source of truth is `src/styles.css` (tokens on `:root`) and `src/motion.ts` (the motion vocabulary). PRODUCT.md holds the binding art direction.

## Colors

- **Paper `#ffffff`** is every surface. There is no second background colour and no dark theme.
- **Ink `#141414`** is every line, every piece of primary text, and the fill of the two "said loudly" states: the NOW stamp and the winner's ticket.
- **Ink soft `#595959`** is secondary text (hints, labels, sub-lines). It passes 4.5:1 on paper. Do not go lighter for text.
- **Ink mute `#a8a8a8`** is only for dashed placeholders: empty seats, empty board slots, the empty discard pile. Never text.
- **Ink faint `#e6e6e6`** is hairline row dividers and the hover fill of paper buttons.
- **Suit red `#c8372d`** is hearts and diamonds, error text, and the NOW stamp in its last five seconds. Suits never rely on it alone: the suit shape carries the meaning.
- **Highlighter `#ffe14d`** is reserved for "this is where the action is": the acting player's ticket, the primary button, the selected option, the raise thumb, the underline on winning cards, text selection. Never decoration.

## Typography

One family everywhere: **Shantell Sans**, loaded as a variable font with its `BNCE` (bounce) and `INFM` (informality) axes. Weight 800 for anything that names or counts (headings, names on your own ticket, stacks, pot, buttons); 400 for explanation.

- Numbers that change use `font-variant-numeric: tabular-nums`: stacks, pot, bets, the raise amount, the countdown.
- Sizes on the table are tied to the table's own width with container units (`cqi`) and clamped, so a phone table and a laptop table keep the same proportions.
- The acting player's ticket gets bouncier as their time runs out (the two font axes rise from 0 to 100 over the last 45% of the turn). This is the type system's one expressive move; do not use those axes anywhere else.
- Headings wrap balanced; paragraphs wrap pretty.

## Layout

- **Home:** one column, max 1040px. Headline with a squiggle underline, then one boxed entry per game, then the leaderboard as two slightly rotated receipts.
- **Table, desktop (over 960px):** a 57px one-row top bar; the table stage centred and sized from the viewport height so the table, your hand and your buttons fit without scrolling; your hand and the action buttons share one line under the table; the settings/rules drawer is a 360px column that pushes the table over.
- **Table, phone portrait (960px and under):** the same one-row top bar with icon-only buttons; the table fits between the bar and a **dock** pinned to the bottom that holds your cards and your buttons together; the drawer becomes a bottom sheet with a drag handle. On a narrow table (under 520px wide) bets are written on the seat tickets instead of sitting on the table, because there is no room for chips between the seats and the board.
- **Table, phone landscape (under 520px tall):** the dock moves to the right edge as a 272px column so the table keeps the height.
- Seats are placed round an ellipse starting from you at the bottom, leaving the top for the dealer. The board and pot sit in the middle; the deck and discard pile sit in front of the dealer.
- Touch targets are at least 44px on phones and 40px on desktop bars.

## Elevation & Depth

Flat paper with a little lift. Borders do the structural work. Shadows exist only to say "this piece of paper is sitting on top": always ink-coloured, always with a downward offset and a soft blur, never a zero-offset glow and never a hard block shadow.

- Buttons (stickers) carry a 1px ink edge plus a soft drop below, which deepens on hover.
- Tickets, the pot, the result slip and popovers get progressively longer soft drops.
- Receipts and the pot are rotated by about 1 to 1.5 degrees so they read as paper put down by hand.
- No glass, no blur, no gradients.

## Shapes

- All drawn art (table line, cards, dealer, chips, timer ring) runs through one SVG displacement filter (`#wobble`) so every line shares the same hand.
- Radii by object, not by scale: tickets are nearly square (4px) like torn paper stubs; inputs 10px; stickers 14px; the home game box 22px; pills fully round.
- Avatars are slightly lopsided circles, not perfect ones.
- Placeholders are dashed outlines in ink mute.
- Icons are one custom set: 2px round stroke on a 24px grid, `currentColor`.
- Focus is a 2.5px dashed ink outline, offset 3px.

## Components

- **Sticker (button):** paper or highlighter fill, 2.5px ink border, weight 800. Highlighter marks the one primary action in a group. Press scales to 0.96 in 100ms.
- **Pill:** small round paper button or label for secondary actions and toggles. Inverts to ink when on.
- **Ticket:** a player's name and stack under their avatar. Yellow while they act, with an ink **NOW** strip along the bottom showing seconds left ("YOUR TURN" on yours); struck through and dimmed when folded; inverted to ink when they win.
- **Turn ring:** an ink ring round the acting avatar that drains with the clock.
- **Receipt:** a plain bordered slip for anything listed or totalled: the pot, the hand history, the leaderboard columns, the host panel, the rules.
- **Card:** original 5:7 art, corner indices, pips drawn as suit shapes, doodled crowns for court cards, a hatched back with a tea cup.
- **Dock (phone):** your fanned cards on the left, raise controls beside them, Fold / Call / Raise full width below.
- **Drawer:** side column on desktop, bottom sheet on phone. Holds host settings or the table rules, and Leave seat.

### Motion

Card deals, flips, chip slides, number tweens and the turn timer run on anime.js; press and hover feedback are CSS transitions. Timings follow the transitions.dev token scale.

- One curve for surfaces opening, closing and moving: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Opens are slower than closes: drawer 400ms in, 350ms out; popover 250ms in, 150ms out.
- Staggers are 40ms a row and the whole list lands inside 300ms.
- Overshoot only on the NOW ticket popping on. Nothing else bounces.
- The phone sheet follows the finger and settles on a spring.
- With reduced motion on, nothing slides, lifts or turns: cards and chips appear in place, and only colour and opacity fade.

## Do's and Don'ts

**Do**

- Keep highlighter for the acting player and the primary action only.
- Say each state once, in words and in form: NOW has a label, a colour and a ring; folded has a strike and a dim.
- Size table elements from the table's width so every screen keeps the same composition.
- Draw new art with the same 2 to 3px ink line and pass it through the wobble filter.

**Don't**

- Don't add felt, gold, neon, gradients, glass or photo avatars.
- Don't introduce a second typeface or a second accent colour.
- Don't use ink mute or ink faint for text.
- Don't put floating elements over the board on narrow tables; write the information on the ticket.
- Don't add looping or ambient animation; motion happens when the game state changes.

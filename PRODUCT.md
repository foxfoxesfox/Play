# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite front end, served by a Cloudflare Worker. One Durable Object per table holds game state and the players' WebSockets. Deployed on the `play.` subdomain of foxesvx.dev (DNS already on Cloudflare). Motion uses anime.js wherever possible (owner's request): turn timer (`createTimer`), deals, flips, chip slides, number tweens. Small press/hover feedback stays in CSS.

## Users

A friend group playing together. Settings vary: everyone in one room on their own phones, everyone remote on a Discord call (mostly laptops), or a mix of both at the same table.

## Product Purpose

play.foxesvx.dev is a small hub for multiplayer games with friends. Poker is the first game. A host opens a table, shares an invite link, friends type a nickname and sit down, and the group plays live together. Success is a game night that runs without anyone needing a physical deck, an account, or rules help.

## Positioning

A private, no-account game table for one friend group, with hand-made character instead of a casino-app look.

## Operating Context

- Joining: invite link + nickname, no accounts. Refresh or disconnect returns the player to their seat.
- Host controls: choose mode and options, start/pause, blinds and starting stack, kick a player.
- Players talk to each other outside the app (in the room, or on Discord), so the app has no chat in v1.
- Phones and laptops at the same table, in portrait and landscape.

## Capabilities and Constraints

- Poker modes, chosen by the host per table: No-Limit Hold'em, Limit Hold'em, Five-Card Draw. Options: rebuys, rising blinds.
- 2 to 9 seats. Play chips only; no real money, ever.
- Turn timer (default 30 s); on timeout the player checks if possible, otherwise folds.
- Server-authoritative: the server shuffles and deals, and each client only ever receives its own hidden cards.
- The site is a hub: the home page must leave room for future games.
- Out of scope for v1: spectators, chat, multiple concurrent tables per host, accounts, stats.

## Brand Commitments

- No brand identity or mascot of its own; foxesvx.dev is just the domain.
- Binding art direction from the owner: hand-drawn throughout the whole app, in the spirit of HEYTEA's line-drawing style and the owner's own site foxesvx.dev (black ink on white paper, Shantell Sans, doodled line art, squiggle underlines).
- Playing cards are original art. The dqnamo.com cards were the inspiration for feel (clean 5:7 cards, corner indices, fanned hand you hover and flick to play) but carry no license, so none of their code or art is used.

## Evidence on Hand

None yet: no logos, illustrations or assets in the repo. Do not invent player counts, testimonials or stats.

## Product Principles

1. Fair by construction: hidden information never leaves the server except to its owner.
2. Zero friction to sit down: a link and a name, nothing else.
3. Readable at a glance across the room or across a call: whose turn, the pot, and what to call are never ambiguous.
4. Hand-made, not casino: charm comes from drawing, not from neon, gold or felt clichés.

## Accessibility & Inclusion

Suits must be distinguishable without relying on color alone. Every action is keyboard-reachable on laptops and works one-handed on phones. Respect reduced motion.

# play

Games with friends at play.foxesvx.dev. First game: poker (No-Limit Hold'em, Limit Hold'em, Five-Card Draw).

React + Vite front end, one Cloudflare Durable Object per table (`worker/table.ts`), rules engine in `shared/poker.ts`.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173 — site + worker + durable objects locally
npm test        # rules engine tests
```

## Deploy

```bash
npx wrangler login   # once
npm run deploy       # builds and deploys; serves on play.foxesvx.dev (custom domain in wrangler.jsonc)
```

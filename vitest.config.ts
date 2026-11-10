import { defineConfig } from 'vitest/config'

// separate from vite.config so tests don't boot the Cloudflare runtime
export default defineConfig({ test: { include: ['shared/**/*.test.ts'] } })

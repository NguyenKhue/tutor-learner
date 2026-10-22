import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { tutorApiPlugin } from './server/plugin'

export default defineConfig({
  plugins: [react(), tutorApiPlugin()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true, watch: { ignored: ['**/.data/**'] } },
  preview: { host: '127.0.0.1', port: 5175, strictPort: true },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20000,
  },
})

import path from 'node:path'
import type { Plugin } from 'vite'
import { createApiMiddleware, type ApiPaths } from './api'

/** Mounts the tutor HTTP API on Vite's dev and preview servers. */
export function tutorApiPlugin(): Plugin {
  let root = process.cwd()

  /** The config and data locations, resolved against the project root at request time. */
  const paths = (): ApiPaths => ({
    configFile: path.join(root, 'tutor.config.json'),
    dataDir: path.join(root, '.data'),
  })

  return {
    name: 'tutor-api',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(createApiMiddleware(paths()))
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiMiddleware(paths()))
    },
  }
}

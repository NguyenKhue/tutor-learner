import { vi } from 'vitest'

export type Handler = (body: unknown, url: URL) => unknown | Promise<unknown>
export interface MockRoute { status?: number; body?: unknown; handler?: Handler }

/**
 * Replaces fetch with a router over `routes`, keyed "GET /api/overview" (path only, no query).
 * Returns the list of calls so tests can check what was sent.
 */
export function mockApi(routes: Record<string, MockRoute | Handler | unknown>) {
  const calls: Array<{ method: string; path: string; url: URL; body: unknown }> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
    const method = (init.method ?? 'GET').toUpperCase()
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path: url.pathname, url, body })
    const route = routes[`${method} ${url.pathname}`]
    if (route === undefined) return new Response(JSON.stringify({ error: 'not mocked' }), { status: 404 })
    let status = 200
    let payload: unknown = route
    if (typeof route === 'function') payload = await (route as Handler)(body, url)
    else if (route && typeof route === 'object' && ('status' in route || 'handler' in route || 'body' in route)) {
      const r = route as MockRoute
      status = r.status ?? 200
      payload = r.handler ? await r.handler(body, url) : r.body
    }
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return calls
}

/** Renders at `path` by moving the jsdom location first (the app owns its BrowserRouter). */
export function goTo(path: string) {
  window.history.pushState({}, '', path)
}

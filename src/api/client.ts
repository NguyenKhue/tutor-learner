/** An HTTP error from the tutor server, carrying the status and optional error code. */
export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The server's error shape (optional; the body may be missing entirely). */
type ErrorBody = { error?: string; code?: string }

/** Sends one JSON request and returns the decoded 2xx body; anything else throws ApiError. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, // the browser adds Origin itself
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data ?? {}) as ErrorBody
    throw new ApiError(err.error ?? res.statusText, res.status, err.code)
  }
  return data as T
}

/** Thin typed wrapper over fetch for the tutor server's JSON API. */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
}

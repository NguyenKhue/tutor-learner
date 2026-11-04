import type { InterviewsFile } from '../../src/lib/types'
import { createJsonStore } from './../state'

export function emptyInterviews(): InterviewsFile {
  return { version: 1, sessions: [] }
}

function validateInterviews(v: unknown): InterviewsFile {
  const f = v as Partial<InterviewsFile> | null
  if (!f || typeof f !== 'object' || f.version !== 1) throw new Error('unknown interviews version')
  if (!Array.isArray(f.sessions)) throw new Error('missing sessions')
  return f as InterviewsFile
}

/** interviews.json: the mock-interview sessions, stored like state.json. */
export function createInterviewStore(file: string) {
  return createJsonStore<InterviewsFile>(file, emptyInterviews, validateInterviews)
}

import { expect, test } from 'vitest'
import type { InterviewSession, PlannedQuestion, QuestionReport, RoundKind, WeakSpot } from '../../src/lib/types'
import { knownWeakKeys, reaskQueue, summarizeWeakSpots } from './history'

const pq = (q: string, prompt: string, reask?: string): PlannedQuestion => ({
  q, prompt, type: 'scenario', source: { url: 'https://x.com' }, rubric: { mid: ['m'], senior: ['s'], lead: ['l'] }, probes: [], ...(reask ? { reask } : {}),
})
const qr = (q: string, reasoning: number, depth: number): QuestionReport => ({
  q, scores: { reasoning, depth, structure: 3, english: 3, length: 3 }, missed: [], sample: '', englishNotes: [],
})

interface Spec {
  id: string
  created: string
  kind?: RoundKind
  questions: { prompt: string; reask?: string; reasoning: number; depth: number }[]
  weak?: WeakSpot[]
  state?: InterviewSession['state']
}
function session(s: Spec): InterviewSession {
  const kind = s.kind ?? 'technical'
  return {
    id: s.id,
    created: s.created,
    setup: { source: '', level: 'senior', rounds: [kind], topics: [], web: false, readAloud: false },
    plan: [{ kind, persona: '', intro: '', competencies: [], questions: s.questions.map((q, i) => pq(`0-${i}`, q.prompt, q.reask)) }],
    turns: [],
    state: s.state ?? 'done',
    practice: [],
    report: {
      levelMet: false, summary: '', topFixes: [], nextSteps: { notes: [], topics: [], drills: [], gaps: [], focus: '' },
      questions: s.questions.map((q, i) => qr(`0-${i}`, q.reasoning, q.depth)),
      weakSpots: s.weak ?? [],
    },
  }
}

test('re-asks weak questions after three days, two per round at most', () => {
  const old = session({
    id: 'a',
    created: '2026-10-20',
    questions: [
      { prompt: 'weak 1', reasoning: 1, depth: 3 },
      { prompt: 'fine', reasoning: 4, depth: 4 },
      { prompt: 'weak 2', reasoning: 3, depth: 2 },
      { prompt: 'weak 3', reasoning: 2, depth: 2 },
    ],
  })
  const hr = session({ id: 'b', created: '2026-10-21', kind: 'hr', questions: [{ prompt: 'hr weak', reasoning: 2, depth: 2 }] })
  const fresh = session({ id: 'c', created: '2026-11-03', questions: [{ prompt: 'too new', reasoning: 1, depth: 1 }] })
  const q = reaskQueue([old, hr, fresh], '2026-11-04', ['technical', 'hr'])
  expect(q).toEqual([
    { round: 'technical', prompt: 'weak 1' },
    { round: 'technical', prompt: 'weak 2' },
    { round: 'hr', prompt: 'hr weak' },
  ])
  expect(reaskQueue([old, hr, fresh], '2026-11-04', ['hr']).map((x) => x.prompt)).toEqual(['hr weak'])
  // exactly three days is due, two days is not
  expect(reaskQueue([fresh], '2026-11-05', ['technical'])).toEqual([])
  expect(reaskQueue([fresh], '2026-11-06', ['technical'])).toHaveLength(1)
})

test('a re-ask that scored well leaves the queue', () => {
  const first = session({ id: 'a', created: '2026-10-01', questions: [{ prompt: 'weak', reasoning: 1, depth: 1 }] })
  const again = session({ id: 'b', created: '2026-10-10', questions: [{ prompt: 'weak, reworded', reask: 'weak', reasoning: 3, depth: 4 }] })
  expect(reaskQueue([first, again], '2026-11-04', ['technical'])).toEqual([])
  const worse = session({ id: 'b', created: '2026-10-10', questions: [{ prompt: 'weak, reworded', reask: 'weak', reasoning: 3, depth: 2 }] })
  expect(reaskQueue([first, worse], '2026-11-04', ['technical'])).toEqual([{ round: 'technical', prompt: 'weak' }])
})

const spot = (key: string): WeakSpot => ({ kind: 'content', key, label: `Label ${key}` })

test('weak spots count sessions and show improving when gone from the latest', () => {
  const s1 = session({ id: 'a', created: '2026-10-01', questions: [], weak: [spot('x'), spot('y')] })
  const s2 = session({ id: 'b', created: '2026-10-10', questions: [], weak: [spot('x'), spot('y'), spot('z')] })
  const s3 = session({ id: 'c', created: '2026-10-20', questions: [], weak: [spot('x')] })
  const out = summarizeWeakSpots([s1, s2, s3])
  expect(out.map((o) => [o.key, o.sessions, o.trend, o.lastSeen])).toEqual([
    ['x', 3, 'still', '2026-10-20'],
    ['y', 2, 'improving', '2026-10-10'],
  ])
  expect(out[0]).toMatchObject({ kind: 'content', label: 'Label x' })
})

test('a weak spot seen once is not recurring', () => {
  const s1 = session({ id: 'a', created: '2026-10-01', questions: [], weak: [spot('x')] })
  const s2 = session({ id: 'b', created: '2026-10-10', questions: [], weak: [spot('z')], state: 'running' })
  expect(summarizeWeakSpots([s1, s2])).toEqual([])
  expect(knownWeakKeys([s1, s2]).sort()).toEqual(['x', 'z'])
})

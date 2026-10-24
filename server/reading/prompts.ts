import type { Question, ReadingPriority, ReadingResult } from '../../src/lib/types'
import { ClaudeError } from '../claude'

const ROLE = 'You are a tutor preparing Khue, a mobile engineer, for Android and KMP job interviews.'
const ENGLISH =
  "Write in English. Use short sentences and simple words: the reader's English is intermediate (TOEIC 500-600). Keep correct technical terms. Notes may be in Vietnamese; quote only short terms from them and explain in English."

const QUESTION = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    kind: { type: 'string', enum: ['open'] },
    prompt: { type: 'string' },
    criteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['q', 'kind', 'prompt', 'criteria'],
}

/** Classification of a batch of notes: `{ notes: [{ path, topic, priority, minutes, why }] }`. */
export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          topic: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          priority: { type: 'string', enum: ['high', 'medium', 'low', 'skip'] },
          minutes: { type: 'integer' },
          why: { type: 'string' },
        },
        required: ['path', 'topic', 'priority', 'minutes', 'why'],
      },
    },
  },
  required: ['notes'],
}

/** A reading quiz: `{ questions }`, three open questions. */
export const READING_QUIZ_SCHEMA = { type: 'object', properties: { questions: { type: 'array', items: QUESTION } }, required: ['questions'] }

/** Grades for all quiz answers at once, plus optional English notes per answer. */
export const READING_GRADE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          ok: { type: 'boolean' },
          why: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' } },
          feedback: { type: 'string' },
        },
        required: ['q', 'ok', 'why', 'missing', 'feedback'],
      },
    },
    english: {
      anyOf: [
        { type: 'null' },
        {
          type: 'array',
          items: {
            type: 'object',
            properties: { q: { type: 'string' }, corrected: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } },
            required: ['q', 'corrected', 'notes'],
          },
        },
      ],
    },
  },
  required: ['results', 'english'],
}

/** Asks Claude to put each note under one Roadmap topic (or none) with a priority, reading time and a reason. */
export function buildClassifyPrompt(notes: Array<{ path: string; title: string; head: string }>, topics: Array<{ name: string; hint: string }>): string {
  return [
    ROLE,
    '',
    'Sort the notes below into the study topics, to build a reading list for the interview.',
    '',
    '## Topics (use the exact name, or null)',
    ...topics.map((t) => `- ${t.name}${t.hint ? ` — ${t.hint}` : ''}`),
    '',
    '## Rules',
    '- topic: the ONE topic the note helps most with, spelled exactly as above. Use null when the note does not help an Android/KMP interview (for example home servers, vocabulary lists, tool manuals unrelated to mobile work).',
    '- priority: "high" = core interview knowledge asked often; "medium" = useful depth; "low" = nice to know or very narrow; "skip" = index pages, tables of contents, raw dumps, or notes with almost no content.',
    '- minutes: reading time in whole minutes for the full note (about 200 words per minute; the length in characters is given).',
    '- why: one short sentence in simple English: what the reader gains for the interview.',
    '- Return one entry per note, with the path exactly as given.',
    '',
    '## Notes (only the beginning of each note is shown)',
    ...notes.flatMap((n) => ['', `PATH: ${n.path}`, `TITLE: ${n.title}`, n.head]),
  ].join('\n')
}

/** Asks for three open questions that check the main ideas of a note the learner just read. */
export function buildReadingQuizPrompt(title: string, text: string): string {
  return [
    ROLE,
    ENGLISH,
    '',
    `Khue just read the note "${title}". Write exactly 3 open questions that check whether they understood its main ideas (not trivia, not exact numbers).`,
    '- Each question asks them to explain in their own words, and can be answered in 2-5 sentences.',
    '- The 3 questions cover different ideas of the note, the ones most useful in an interview.',
    '- criteria: 2-4 short ideas a correct answer must contain, taken only from the note.',
    '- Use kind "open" and codes r1, r2, r3.',
    '',
    `## Note: ${title}`,
    text,
  ].join('\n')
}

/** Checks a generated quiz: 3 open questions with 2-4 criteria; returns them renumbered r1..r3. */
export function validateReadingQuiz(raw: { questions?: Question[] }): Question[] {
  const qs = Array.isArray(raw?.questions) ? raw.questions : []
  if (qs.length !== 3) throw new ClaudeError('failed', `expected 3 reading questions, got ${qs.length}`)
  return qs.map((q, i) => {
    const criteria = (q.criteria ?? []).filter((c) => c.trim())
    if (!q.prompt?.trim() || criteria.length < 2 || criteria.length > 4) throw new ClaudeError('failed', `reading question ${i + 1} is not valid`)
    return { q: `r${i + 1}`, kind: 'open' as const, prompt: q.prompt.trim(), criteria }
  })
}

/** Grades all answers of a reading quiz in one go, optionally with English notes, optionally re-checking with an appeal. */
export function buildReadingGradePrompt(a: {
  title: string
  text: string
  questions: Question[]
  answers: Record<string, string>
  english: boolean
  appeal?: string
}): string {
  const lines = [
    ROLE,
    ENGLISH,
    '',
    `Grade Khue's answers about the note "${a.title}". Judge ONLY against each question's criteria and the note.`,
    '- ok = true only if the answer covers every criterion correctly (wording may differ; the answer may be in Vietnamese or English).',
    '- why: one short line with the reason. missing: the criteria not covered (empty when ok). feedback: 2-4 short sentences in simple English.',
    '- Return one result per question, with its code.',
  ]
  if (a.english) {
    lines.push(
      '- Also return "english": one entry per answer with its code; corrected = the answer rewritten in natural, correct interview English with the same meaning (translate if it was Vietnamese); notes = at most 3 short notes about grammar or wording.',
    )
  } else {
    lines.push('- Set "english": null.')
  }
  if (a.appeal) {
    lines.push(
      '',
      `Khue disagrees with an earlier verdict and argues: ${a.appeal}`,
      'Re-check the answers against the criteria with this argument in mind. You may keep the earlier verdict if the argument is wrong.',
    )
  }
  for (const q of a.questions) {
    lines.push('', `## ${q.q}: ${q.prompt}`, 'Criteria:', ...(q.criteria ?? []).map((c) => `- ${c}`), '<answer>', a.answers[q.q] ?? '', '</answer>')
  }
  lines.push('', `## Note: ${a.title}`, a.text)
  return lines.join('\n')
}

/** Normalizes one classification entry: unknown topics become null, bad priorities "low", minutes at least 1. */
export function cleanClassification(
  n: { topic?: unknown; priority?: unknown; minutes?: unknown; why?: unknown },
  topics: string[],
): { topic: string | null; priority: ReadingPriority; minutes: number; why: string } {
  const priorities = ['high', 'medium', 'low', 'skip']
  return {
    topic: typeof n.topic === 'string' && topics.includes(n.topic) ? n.topic : null,
    priority: (priorities.includes(n.priority as string) ? n.priority : 'low') as ReadingPriority,
    minutes: Math.max(1, Math.round(Number(n.minutes) || 1)),
    why: typeof n.why === 'string' ? n.why.trim() : '',
  }
}

/** Checks a grade: one result per question, in question order. */
export function validateReadingGrade(raw: { results?: ReadingResult[] }, questions: Question[]): ReadingResult[] {
  const results = Array.isArray(raw?.results) ? raw.results : []
  return questions.map((q, i) => {
    const r = results.find((x) => x.q === q.q) ?? results[i]
    if (!r || typeof r.ok !== 'boolean') throw new ClaudeError('failed', `no grade for ${q.q}`)
    return { q: q.q, ok: r.ok, why: r.why ?? '', missing: Array.isArray(r.missing) ? r.missing : [], feedback: r.feedback ?? '' }
  })
}

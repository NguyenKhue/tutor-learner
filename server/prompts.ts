import type { Point, Question } from '../src/lib/types'
import { ClaudeError } from './claude'

/** Everything one prompt needs: the point, its question, its scope and its source notes. */
export interface PromptContext {
  point: Point
  title: string
  pointQuestion: string
  scope: string
  sources: Array<{ link: string; text: string }>
}

/** JSON schema for the lesson response: `{ markdown }`. */
export const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    markdown: { type: 'string' },
  },
  required: ['markdown'],
  additionalProperties: false,
}

const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    kind: { type: 'string', enum: ['pretest', 'mcq', 'open'] },
    prompt: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer' },
    misconceptions: { type: 'array', items: { type: 'string' } },
    criteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['q', 'kind', 'prompt'],
}

/** JSON schema for the question bank response: `{ questions }`. */
export const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: { type: 'array', items: QUESTION_SCHEMA },
  },
  required: ['questions'],
  additionalProperties: false,
}

/** JSON schema for the grade response: `{ grade, english }`. */
export const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    grade: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        why: { type: 'string' },
        missing: { type: 'array', items: { type: 'string' } },
        feedback: { type: 'string' },
      },
      required: ['ok', 'why', 'missing', 'feedback'],
    },
    english: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            corrected: { type: 'string' },
            notes: { type: 'array', items: { type: 'string' } },
          },
          required: ['corrected', 'notes'],
        },
      ],
    },
  },
  required: ['grade', 'english'],
}

const ROLE =
  'You are a tutor preparing Khue, a mobile engineer, for Android and KMP job interviews.'

/** The display title of a point: its name after the topic slash, without a leading number. */
export function pointTitle(pointId: string): string {
  const name = pointId.slice(pointId.lastIndexOf('/') + 1)
  return name.replace(/^\d+\s+/, '')
}

/** Builds the Markdown lesson prompt for one point. */
export function buildLessonPrompt(ctx: PromptContext): string {
  return [
    ROLE,
    '',
    sharedRules(),
    '',
    pointBlock(ctx),
    '',
    '## Task',
    'Write a short lesson of about 300-600 words in Markdown.',
    '- Start with a summary of 2-3 sentences.',
    '- Then explain the mechanism step by step.',
    '- Then add a small code example, but only if the sources have one.',
    '- Then list the common mistakes.',
    `- End with a final line "Sources:" listing the wikilinks exactly as given: ${wikilinks(ctx)}.`,
    '- Do not use an H1 heading.',
    '',
    'Return JSON shaped as {"markdown": "..."}.',
  ].join('\n')
}

/** Builds the prompt that asks for one pretest plus three main questions. */
export function buildQuestionsPrompt(ctx: PromptContext, avoidCodes: string[]): string {
  const mainKind = ctx.point.type === 'concept' ? 'open' : 'mcq'
  return [
    ROLE,
    '',
    sharedRules(),
    '',
    pointBlock(ctx),
    '',
    '## Task',
    'Create a question bank for this point: exactly 1 pretest question and exactly 3 main questions.',
    '',
    '### Pretest',
    '- One short, open question that checks what Khue already knows.',
    '- It must be answerable in one or two sentences.',
    '- "criteria" holds 1-3 key ideas a good answer contains.',
    '',
    '### Main questions',
    mainKind === 'mcq'
      ? `Use kind "${mainKind}" (not "open") for all three main questions.`
      : `Use kind "${mainKind}" (not "mcq") for all three main questions.`,
    '- The three questions must test different aspects of the point, not the same idea twice.',
    '- "q" holds the code q1, q2, q3 or q4. The codes are renumbered later, so order them as you like; the pretest comes first.',
    '',
    mainKind === 'mcq' ? mcqRules() : openRules(),
    '',
    avoidCodes.length > 0
      ? `These codes already exist for other points: ${avoidCodes.join(', ')}. This is only for your information.`
      : 'No codes exist yet for this point.',
    '',
    'Return JSON shaped as {"questions": [...]}.',
  ].join('\n')
}

/** Builds the prompt that grades one answer, optionally with English feedback and an appeal. */
export function buildGradePrompt(
  a: PromptContext & { question: Question; answer: string; english: boolean; appeal?: string },
): string {
  const lines = [
    ROLE,
    '',
    sharedRules(),
    '',
    pointBlock(a),
    '',
    '## Question to grade',
    `Prompt: ${a.question.prompt}`,
    '',
  ]

  if (a.question.kind === 'mcq') {
    const options = a.question.options ?? []
    lines.push('Options:')
    options.forEach((option, i) => lines.push(`${i}. ${option}`))
    const correct = typeof a.question.answer === 'number' ? options[a.question.answer] : undefined
    lines.push(`Correct option: ${a.question.answer}${correct ? ` (${correct})` : ''}`, '')
  } else {
    lines.push('The answer must cover these criteria:')
    for (const c of a.question.criteria ?? []) lines.push(`- ${c}`)
    lines.push('')
  }

  lines.push("Khue's answer:", '<answer>', a.answer, '</answer>', '')

  lines.push(
    '## Grading rules',
    '- ok = true only if the answer covers every criterion correctly. The wording may differ from the criteria.',
    '- Khue may answer in Vietnamese or in English; judge the meaning, not the spelling.',
    '- why = ONE short line stating the reason for the verdict.',
    '- missing = the criteria that the answer does not cover. Use [] when ok is true.',
    '- feedback = 2-4 short sentences in simple English. Explain the mistake, or say what to add.',
    '',
  )

  if (a.english) {
    lines.push(
      '## English',
      '- Set english = { "corrected": ..., "notes": ... }.',
      "- corrected = Khue's answer rewritten in natural, correct interview English with the same meaning. If the answer was in Vietnamese, translate it.",
      '- notes = at most 3 short notes about grammar or more natural wording.',
      '',
    )
  } else {
    lines.push('Set "english": null.', '')
  }

  if (a.appeal !== undefined) {
    lines.push(
      '## Appeal',
      `Khue disagrees with an earlier verdict and argues: ${a.appeal}`,
      'Re-check the answer against the criteria with this argument in mind. You may keep the earlier verdict if the argument is wrong.',
      '',
    )
  }

  lines.push('Return JSON shaped as {"grade": {...}, "english": ...}.')
  return lines.join('\n')
}

/** Checks a generated bank and returns it renumbered after any avoided codes, pretest first. */
export function validateBank(type: Point['type'], raw: { questions: Question[] }, avoidCodes: string[]): Question[] {
  const questions = Array.isArray(raw?.questions) ? raw.questions : []
  const pretests = questions.filter((q) => q.kind === 'pretest')
  const mains = questions.filter((q) => q.kind !== 'pretest')

  if (pretests.length !== 1) fail(`expected exactly 1 pretest question, got ${pretests.length}`)
  if (mains.length !== 3) fail(`expected exactly 3 main questions, got ${mains.length}`)

  const pretest = pretests[0]
  if (!pretest.criteria || pretest.criteria.length < 1 || pretest.criteria.length > 3) {
    fail('pretest must have 1-3 criteria')
  }
  if (!pretest.prompt?.trim()) fail('pretest prompt is empty')

  const wanted: Question['kind'] = type === 'concept' ? 'open' : 'mcq'
  for (const q of mains) {
    if (q.kind !== wanted) fail(`main question "${q.q}" must be kind "${wanted}" for a ${type} point`)
    if (!q.prompt?.trim()) fail(`main question "${q.q}" prompt is empty`)

    if (wanted === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length !== 4) fail(`mcq "${q.q}" must have 4 options`)
      if (!Number.isInteger(q.answer) || q.answer! < 0 || q.answer! > 3) fail(`mcq "${q.q}" answer must be an index 0-3`)
      if (!Array.isArray(q.misconceptions) || q.misconceptions.length !== 4) {
        fail(`mcq "${q.q}" must have 4 misconceptions`)
      }
    } else if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 4) {
      fail(`open question "${q.q}" must have 2-4 criteria`)
    }
  }

  const highest = avoidCodes.reduce((max, code) => {
    const match = /^q(\d+)$/.exec(code)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return [pretest, ...mains].map((q, i) => ({ ...q, q: `q${highest + 1 + i}` }))
}

function fail(reason: string): never {
  throw new ClaudeError('failed', reason)
}

function sharedRules(): string {
  return [
    '## Shared rules',
    '- Teach and judge ONLY from the source notes below. If they are missing information or contradict each other, say so. Do not invent facts.',
    "- Write in English, in the register of a technical interview answer. Use short sentences and simple words: the reader's English is intermediate (TOEIC 500-600). Keep correct technical terms. Sources may be in Vietnamese; quote only short terms from them and explain in English.",
  ].join('\n')
}

function pointBlock(ctx: PromptContext): string {
  return [
    '## Point',
    `- Title: ${ctx.title}`,
    `- Type: ${ctx.point.type}`,
    `- Question: ${ctx.pointQuestion}`,
    `- Scope: ${ctx.scope}`,
    '',
    ...ctx.sources.map((s) => `### Source: ${s.link}\n${s.text}`),
  ].join('\n')
}

function wikilinks(ctx: PromptContext): string {
  return ctx.sources.map((s) => s.link).join(', ')
}

function mcqRules(): string {
  return [
    'For every mcq question:',
    '- Give exactly 4 options of similar length and tone.',
    '- "answer" is the index 0-3 of the correct option.',
    '- "misconceptions" has exactly 4 strings, one per option, so misconceptions[answer] must be an empty string.',
    '- Every other entry names the real misconception that its option represents.',
  ].join('\n')
}

function openRules(): string {
  return [
    'For every open question:',
    "- Ask Khue to explain the idea in their own words.",
    '- "criteria" holds 2-4 ideas that a correct answer must contain.',
  ].join('\n')
}

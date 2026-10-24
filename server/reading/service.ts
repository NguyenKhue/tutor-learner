import fs from 'node:fs'
import path from 'node:path'
import { dueReading, upNext } from '../../src/lib/readingOrder'
import { deriveReading, interviewCap } from '../../src/lib/readingSchedule'
import type { CatalogEntry, EnglishNotes, ReadingCheck, ReadingItem, ReadingOverview, ReadingQuiz, ReadingResult } from '../../src/lib/types'
import { ClaudeError } from '../claude'
import { readTopicOrder } from '../roadmap'
import type { StateStore } from '../state'
import { StudyError } from '../study'
import type { TutorCli } from '../tutor'
import { resolveWikilink } from '../vault'
import { mergeCatalog, readNoteText, scanVault } from './catalog'
import {
  CLASSIFY_SCHEMA,
  READING_GRADE_SCHEMA,
  READING_QUIZ_SCHEMA,
  buildClassifyPrompt,
  buildReadingGradePrompt,
  buildReadingQuizPrompt,
  cleanClassification,
  validateReadingGrade,
  validateReadingQuiz,
} from './prompts'

const BATCH = 10
const HEAD_CHARS = 1500
const PASS_COUNT = 2

export interface ReadingDeps {
  vault: string
  tutor: TutorCli
  store: StateStore
  claude: <T>(prompt: string, schema: object) => Promise<T>
  today: () => string
  newId?: () => string
}

export interface ReadingService {
  overview(): Promise<ReadingOverview>
  classifyPending(): Promise<void>
  classifying(): boolean
  reclassify(target: string | 'all'): Promise<void>
  note(path: string): Promise<{ markdown: string; entry: CatalogEntry }>
  quiz(path: string): Promise<ReadingQuiz>
  submit(path: string, answers: Record<string, string>): Promise<ReadingCheck>
  retry(path: string, id: string): Promise<ReadingCheck>
  appeal(path: string, id: string, reason: string): Promise<ReadingCheck>
  skip(path: string, skipped: boolean): Promise<void>
  todayReading(cap: number): Promise<string[]>
  lastError(): ClaudeError | null
}

interface GradeResponse {
  results: ReadingResult[]
  english: Array<{ q: string; corrected: string; notes: string[] }> | null
}

/** The Reading tab: catalog, classification, quizzes and rechecks. Reads the vault, writes only state.json. */
export function createReadingService(deps: ReadingDeps): ReadingService {
  const { vault, tutor, store, claude, today } = deps
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const busy = new Set<string>()
  const quizzes = new Map<string, Promise<ReadingQuiz>>()
  let running: Promise<void> | null = null
  let classifyError: string | null = null
  let lastClaude: ClaudeError | null = null

  async function ask<T>(prompt: string, schema: object): Promise<T> {
    try {
      const r = await claude<T>(prompt, schema)
      lastClaude = null
      return r
    } catch (e) {
      if (e instanceof ClaudeError) lastClaude = e
      throw e
    }
  }

  /** Rescans the vault into the catalog; point sources come from the tutor export. */
  async function sync() {
    const exported = await tutor.exportData(today())
    const sources = new Set<string>()
    for (const p of exported.points) {
      for (const link of p.sources) {
        const file = resolveWikilink(vault, link)
        if (file) sources.add(path.relative(fs.realpathSync(vault), fs.realpathSync(file)).split(path.sep).join('/'))
      }
    }
    const scanned = scanVault(vault)
    await store.update((s) => {
      s.reading.catalog = mergeCatalog(s.reading.catalog, scanned, sources)
    })
    return exported
  }

  async function config() {
    const exported = await tutor.exportData(today())
    return { cap: interviewCap(exported.config), exported }
  }

  function items(state: Awaited<ReturnType<StateStore['read']>>, cap: string | null): ReadingItem[] {
    const date = today()
    return Object.values(state.reading.catalog).map((e) => {
      const progress = state.reading.progress[e.path] ?? { checks: [] }
      const d = deriveReading(progress.checks, date, cap)
      return {
        ...e,
        ...d,
        skipped: Boolean(progress.skipped),
        openCheck: progress.checks.find((c) => c.state === 'pending') ?? null,
      }
    })
  }

  async function overview(): Promise<ReadingOverview> {
    const exported = await sync()
    const cap = interviewCap(exported.config)
    const state = await store.read()
    const all = items(state, cap)
    const list = state.today
    const todayTopics = list ? [...list.review, ...list.fresh, ...list.extra].map((id) => id.split('/')[0]) : []
    const studied = [...new Set(exported.points.filter((p) => p.status !== 'new').map((p) => p.topic))]
    const present = all.filter((i) => i.present)
    return {
      items: all.sort((a, b) => (a.path < b.path ? -1 : 1)),
      upNext: upNext(all, todayTopics, studied, readTopicOrder(vault)),
      due: dueReading(all, today()),
      classify: {
        total: present.length,
        done: present.filter((i) => i.classifiedHash === i.hash).length,
        running: running !== null,
        error: classifyError,
      },
    }
  }

  /** Topic names with a hint from the Roadmap's "Main sources" column, for the classify prompt. */
  function topicHints(topics: string[]): Array<{ name: string; hint: string }> {
    let roadmap = ''
    try {
      roadmap = fs.readFileSync(path.join(vault, 'Tutor', 'Roadmap.md'), 'utf8')
    } catch {
      // no roadmap: names only
    }
    return topics.map((name) => {
      const row = roadmap.split('\n').find((l) => l.startsWith('|') && l.split('|').map((c) => c.trim()).includes(name))
      const cells = row?.split('|').map((c) => c.trim()) ?? []
      return { name, hint: cells.length > 5 ? cells[5].replace(/`/g, '') : '' }
    })
  }

  /** Classifies every present note whose content changed since its last classification, ten per Claude call. */
  function classifyPending(): Promise<void> {
    if (running) return running
    running = (async () => {
      classifyError = null
      await sync()
      const topics = readTopicOrder(vault)
      const hints = topicHints(topics)
      const failed = new Set<string>()
      for (;;) {
        const state = await store.read()
        const pending = Object.values(state.reading.catalog)
          .filter((e) => e.present && e.classifiedHash !== e.hash && !failed.has(e.path))
          .sort((a, b) => (a.path < b.path ? -1 : 1))
          .slice(0, BATCH)
        if (pending.length === 0) return
        const notes = pending.map((e) => ({ path: e.path, title: e.title, head: safeText(e.path).slice(0, HEAD_CHARS) }))
        let raw: { notes?: Array<Record<string, unknown>> }
        try {
          raw = await ask(buildClassifyPrompt(notes, hints), CLASSIFY_SCHEMA)
        } catch (e) {
          if (e instanceof ClaudeError && e.code !== 'failed') {
            classifyError = e.message
            return
          }
          pending.forEach((p) => failed.add(p.path))
          continue
        }
        await store.update((s) => {
          for (const p of pending) {
            const got = raw.notes?.find((n) => n.path === p.path)
            const entry = s.reading.catalog[p.path]
            if (!got || !entry) {
              failed.add(p.path)
              continue
            }
            Object.assign(entry, cleanClassification(got, topics), { classifiedHash: p.hash })
          }
        })
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  async function reclassify(target: string | 'all'): Promise<void> {
    await store.update((s) => {
      for (const e of Object.values(s.reading.catalog)) if (target === 'all' || e.path === target) delete e.classifiedHash
    })
    await classifyPending()
  }

  function safeText(p: string): string {
    try {
      return readNoteText(vault, p)
    } catch {
      return ''
    }
  }

  async function entryFor(p: string): Promise<CatalogEntry> {
    await sync()
    const entry = (await store.read()).reading.catalog[p]
    if (!entry || !entry.present) throw new StudyError('not-found', `No note ${p}`)
    return entry
  }

  async function note(p: string) {
    const entry = await entryFor(p)
    return { markdown: readNoteText(vault, p), entry }
  }

  /** The note's quiz; made once per version of the note (one Claude call), then reused. */
  function quiz(p: string): Promise<ReadingQuiz> {
    const inFlight = quizzes.get(p)
    if (inFlight) return inFlight
    const task = (async () => {
      const entry = await entryFor(p)
      const saved = (await store.read()).reading.quizzes[p]
      if (saved && saved.hash === entry.hash) return saved
      const raw = await ask<{ questions?: never[] }>(buildReadingQuizPrompt(entry.title, readNoteText(vault, p)), READING_QUIZ_SCHEMA)
      const made: ReadingQuiz = { hash: entry.hash, questions: validateReadingQuiz(raw) }
      await store.update((s) => {
        s.reading.quizzes[p] = made
      })
      return made
    })().finally(() => quizzes.delete(p))
    quizzes.set(p, task)
    return task
  }

  function claim(p: string) {
    if (busy.has(p)) throw new StudyError('bad-state', `Another check is running for ${p}`)
    busy.add(p)
  }

  async function saveCheck(p: string, check: ReadingCheck) {
    await store.update((s) => {
      const progress = (s.reading.progress[p] ??= { checks: [] })
      const i = progress.checks.findIndex((c) => c.id === check.id)
      if (i >= 0) progress.checks[i] = structuredClone(check)
      else progress.checks.push(structuredClone(check))
    })
  }

  /** Grades a check in one Claude call; a Claude error leaves it pending with the error, never failed. */
  async function grade(p: string, check: ReadingCheck, appeal?: string): Promise<ReadingCheck> {
    const state = await store.read()
    const q = state.reading.quizzes[p]
    if (!q || q.hash !== check.quizHash) throw new StudyError('bad-state', `The quiz for ${p} changed; take it again`)
    try {
      const raw = await ask<GradeResponse>(
        buildReadingGradePrompt({
          title: state.reading.catalog[p]?.title ?? p,
          text: readNoteText(vault, p),
          questions: q.questions,
          answers: check.answers,
          english: state.settings.englishFeedback,
          appeal,
        }),
        READING_GRADE_SCHEMA,
      )
      const results = validateReadingGrade(raw, q.questions)
      check.results = results
      check.passed = results.filter((r) => r.ok).length >= PASS_COUNT
      check.state = 'graded'
      check.english = englishMap(state.settings.englishFeedback ? raw.english : null)
      delete check.error
    } catch (e) {
      if (!(e instanceof ClaudeError)) throw e
      if (appeal) {
        check.appealed = false
        delete check.appeal
      }
      check.error = { code: e.code, message: e.message }
    }
    await saveCheck(p, check)
    return check
  }

  async function submit(p: string, answers: Record<string, string>): Promise<ReadingCheck> {
    claim(p)
    try {
      const entry = await entryFor(p)
      const state = await store.read()
      const q = state.reading.quizzes[p]
      if (!q || q.hash !== entry.hash) throw new StudyError('bad-state', `Open the quiz for ${p} first`)
      const progress = state.reading.progress[p] ?? { checks: [] }
      if (progress.checks.some((c) => c.state === 'pending')) throw new StudyError('bad-state', `Finish the open check for ${p} first`)
      const clean: Record<string, string> = {}
      for (const question of q.questions) {
        const a = (answers[question.q] ?? '').trim()
        if (!a) throw new StudyError('bad-state', `Answer every question (${question.q} is empty)`)
        clean[question.q] = a
      }
      const check: ReadingCheck = {
        id: newId(),
        date: today(),
        kind: progress.checks.some((c) => c.state === 'graded') ? 'recheck' : 'first',
        quizHash: q.hash,
        answers: clean,
        state: 'pending',
      }
      await saveCheck(p, check)
      return await grade(p, check)
    } finally {
      busy.delete(p)
    }
  }

  async function findCheck(p: string, id: string): Promise<ReadingCheck> {
    const c = (await store.read()).reading.progress[p]?.checks.find((x) => x.id === id)
    if (!c) throw new StudyError('not-found', `No check ${id}`)
    return c
  }

  async function retry(p: string, id: string): Promise<ReadingCheck> {
    claim(p)
    try {
      const c = await findCheck(p, id)
      if (c.state !== 'pending') throw new StudyError('bad-state', `Check ${id} is already graded`)
      return await grade(p, c)
    } finally {
      busy.delete(p)
    }
  }

  async function appeal(p: string, id: string, reason: string): Promise<ReadingCheck> {
    claim(p)
    try {
      const c = await findCheck(p, id)
      if (c.state !== 'graded' || c.passed !== false || c.appealed) throw new StudyError('bad-state', `Check ${id} cannot be appealed`)
      c.appealed = true
      c.appeal = reason
      return await grade(p, c, reason)
    } finally {
      busy.delete(p)
    }
  }

  async function skip(p: string, skipped: boolean) {
    await store.update((s) => {
      const progress = (s.reading.progress[p] ??= { checks: [] })
      if (skipped) progress.skipped = true
      else delete progress.skipped
    })
  }

  async function todayReading(cap: number): Promise<string[]> {
    if (cap <= 0) return []
    const { cap: interview } = await config()
    return dueReading(items(await store.read(), interview), today()).slice(0, cap)
  }

  return {
    overview,
    classifyPending,
    classifying: () => running !== null,
    reclassify,
    note,
    quiz,
    submit,
    retry,
    appeal,
    skip,
    todayReading,
    lastError: () => lastClaude,
  }
}

function englishMap(list: GradeResponse['english']): Record<string, EnglishNotes> | undefined {
  if (!list?.length) return undefined
  return Object.fromEntries(list.map((e) => [e.q, { corrected: e.corrected, notes: e.notes ?? [] }]))
}

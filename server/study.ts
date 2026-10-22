import type { Attempt, EnglishNotes, Grade, HistoryEntry, Point, Question, QuestionBank, RecordResult, Settings } from '../src/lib/types'
import { ClaudeError } from './claude'
import type { PromptContext } from './prompts'
import {
  GRADE_SCHEMA,
  LESSON_SCHEMA,
  QUESTIONS_SCHEMA,
  buildGradePrompt,
  buildLessonPrompt,
  buildQuestionsPrompt,
  pointTitle,
  validateBank,
} from './prompts'
import type { StateStore } from './state'
import type { TutorCli } from './tutor'
import { lessonRelPath, obsidianUrl, readLesson, readPointText, readSources, writeLesson } from './vault'

/** A study action that cannot proceed, tagged with a code the UI can switch on. */
export class StudyError extends Error {
  constructor(public code: 'no-sources' | 'bad-state' | 'not-found', message: string) {
    super(message)
    this.name = 'StudyError'
  }
}

/** The result of asking for the lesson of one point. */
export interface Lesson {
  markdown: string
  missingSources: string[]
  obsidianUrl: string
}

/** One graded answer waiting to be confirmed. */
export interface SubmitArgs {
  point: string
  q: string
  kind: 'learn' | 'review'
  answer: string
}

/** Everything the study service needs from the outside world. */
export interface StudyDeps {
  vault: string
  vaultName: string
  tutor: TutorCli
  store: StateStore
  claude: <T>(prompt: string, schema: object) => Promise<T>
  today: () => string
  newId?: () => string
}

/** The study flow: lessons, question banks, grading, retries, appeals and prefetch. */
export interface StudyService {
  getLesson(pointId: string): Promise<Lesson>
  getBank(pointId: string): Promise<QuestionBank>
  regenerateBank(pointId: string): Promise<QuestionBank>
  pickQuestion(point: Point, bank: QuestionBank, kind: 'learn' | 'review'): Question
  submit(a: SubmitArgs): Promise<Attempt>
  retry(attemptId: string): Promise<Attempt>
  confirm(attemptId: string): Promise<Attempt>
  appeal(attemptId: string, reason: string): Promise<Attempt>
  submitPretest(pointId: string, answer: string | null): Promise<{ feedback: string }>
  openAttempts(): Promise<Attempt[]>
  attemptsFor(pointId: string): Promise<Attempt[]>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  getSettings(): Promise<Settings>
  prefetch(pointIds: string[]): Promise<void>
  lastClaudeError(): Attempt['error'] | null
}

interface GradeResponse {
  grade: Grade
  english: EnglishNotes | null
}

/** Builds the study service on top of the vault, the tutor CLI, the state store and Claude. */
export function createStudyService(deps: StudyDeps): StudyService {
  const { vault, vaultName, tutor, store, claude, today } = deps
  const newId = deps.newId ?? (() => crypto.randomUUID())

  /** Points with an action in flight, so double submits fail fast. */
  const busy = new Set<string>()
  /** Lesson requests in flight, keyed by point id. */
  const lessons = new Map<string, Promise<Lesson>>()
  /** Bank requests in flight, keyed by point id. */
  const banks = new Map<string, Promise<QuestionBank>>()
  /** The last Claude failure, cleared by the next successful call. */
  let lastError: Attempt['error'] | null = null

  // --- Claude and storage helpers -------------------------------------------------

  /** Calls Claude, remembering the last failure and clearing it on success. */
  async function ask<T>(prompt: string, schema: object): Promise<T> {
    try {
      const result = await claude<T>(prompt, schema)
      lastError = null
      return result
    } catch (err) {
      noteClaudeError(err)
      throw err
    }
  }

  /** Remembers a Claude failure so lastClaudeError can report it. */
  function noteClaudeError(err: unknown): void {
    if (err instanceof ClaudeError) lastError = { code: err.code, message: err.message }
  }

  /** Inserts or replaces one attempt in the persisted state. */
  function saveAttempt(attempt: Attempt): Promise<void> {
    return store.update((s) => {
      const copy = structuredClone(attempt)
      const i = s.attempts.findIndex((x) => x.id === attempt.id)
      if (i >= 0) s.attempts[i] = copy
      else s.attempts.push(copy)
    })
  }

  /** Finds a point in the tutor export or fails with not-found. */
  async function findPoint(id: string): Promise<Point> {
    const point = (await tutor.exportData(today())).points.find((p) => p.id === id)
    if (!point) throw new StudyError('not-found', `No point ${id}`)
    return point
  }

  /** Builds the prompt context of one point from its note and its sources. */
  function context(point: Point): PromptContext {
    const text = readPointText(vault, point.id)
    return {
      point,
      title: pointTitle(point.id),
      pointQuestion: text.question,
      scope: text.scope,
      sources: readSources(vault, point.sources).found.map(({ link, text }) => ({ link, text })),
    }
  }

  /** Builds the prompt context of a point looked up by id. */
  async function contextFor(pointId: string): Promise<PromptContext> {
    return context(await findPoint(pointId))
  }

  /** Claims a point for an action, rejecting a second concurrent action. */
  function claim(pointId: string): void {
    if (busy.has(pointId)) throw new StudyError('bad-state', `Another action is running for ${pointId}`)
    busy.add(pointId)
  }

  // --- Lessons --------------------------------------------------------------------

  /** Returns the stored lesson, or generates and writes one, sharing in-flight work. */
  function getLesson(pointId: string): Promise<Lesson> {
    const existing = lessons.get(pointId)
    if (existing) return existing
    const task = loadLesson(pointId).finally(() => lessons.delete(pointId))
    lessons.set(pointId, task)
    return task
  }

  /** Reads a lesson note, or builds it from sources when it does not exist yet. */
  async function loadLesson(pointId: string): Promise<Lesson> {
    const point = await findPoint(pointId)
    const markdown = readLesson(vault, pointId)
    const { found, missing } = readSources(vault, point.sources)
    const url = obsidianUrl(vaultName, lessonRelPath(pointId))
    if (markdown !== null) return { markdown, missingSources: missing, obsidianUrl: url }
    if (found.length === 0) throw noSources(missing)
    const raw = await ask<{ markdown: string }>(buildLessonPrompt(context(point)), LESSON_SCHEMA)
    writeLesson(vault, pointId, raw.markdown)
    return { markdown: raw.markdown, missingSources: missing, obsidianUrl: url }
  }

  // --- Question banks -------------------------------------------------------------

  /** Returns the cached bank, or generates one, sharing in-flight work. */
  function getBank(pointId: string): Promise<QuestionBank> {
    return sharedBank(pointId, false)
  }

  /** Generates a fresh bank while avoiding the codes of the old bank and of the history. */
  function regenerateBank(pointId: string): Promise<QuestionBank> {
    return sharedBank(pointId, true)
  }

  /** Runs getBank/regenerateBank once per point at a time. */
  function sharedBank(pointId: string, force: boolean): Promise<QuestionBank> {
    const existing = banks.get(pointId)
    if (existing) return existing
    const task = loadBank(pointId, force).finally(() => banks.delete(pointId))
    banks.set(pointId, task)
    return task
  }

  /** Builds, validates and saves a bank, refusing points without source notes. */
  async function loadBank(pointId: string, force: boolean): Promise<QuestionBank> {
    const state = await store.read()
    const current = state.banks[pointId]
    if (current && !force) return current
    if (force && state.attempts.some((a) => a.point === pointId && (a.state === 'pending' || a.state === 'graded'))) {
      throw new StudyError('bad-state', `Finish the open answer for ${pointId} before making new questions`)
    }
    const point = await findPoint(pointId)
    const { found, missing } = readSources(vault, point.sources)
    if (found.length === 0) throw noSources(missing)
    const avoid = avoidCodes(point.history, force ? current : undefined)
    const raw = await ask<{ questions: Question[] }>(buildQuestionsPrompt(context(point), avoid), QUESTIONS_SCHEMA)
    let questions: Question[]
    try {
      questions = validateBank(point.type, raw, avoid)
    } catch (err) {
      noteClaudeError(err)
      throw err
    }
    const bank: QuestionBank = { point: pointId, created: today(), questions }
    await store.update((s) => {
      // An answer may have started while Claude was writing: its question must stay in the bank.
      if (force && s.attempts.some((a) => a.point === pointId && (a.state === 'pending' || a.state === 'graded'))) {
        throw new StudyError('bad-state', `Finish the open answer for ${pointId} before making new questions`)
      }
      s.banks[pointId] = structuredClone(bank)
    })
    return bank
  }

  /** The codes a new bank must skip: the history, plus the old bank when regenerating. */
  function avoidCodes(history: HistoryEntry[], old: QuestionBank | undefined): string[] {
    const codes = history.map((h) => h.q)
    for (const q of old?.questions ?? []) if (!codes.includes(q.q)) codes.push(q.q)
    return codes
  }

  // --- Grading --------------------------------------------------------------------

  /** Grades an attempt, then records it when the verdict is a pass or the question is an mcq. */
  async function gradeAttempt(attempt: Attempt, question: Question): Promise<Attempt> {
    if (question.kind === 'mcq') {
      attempt.grade = gradeMcq(question, attempt.answer)
      attempt.state = 'graded'
      delete attempt.error
      await saveAttempt(attempt)
      return recordAttempt(attempt)
    }
    try {
      const english = (await store.read()).settings.englishFeedback
      const ctx = await contextFor(attempt.point)
      const r = await ask<GradeResponse>(
        buildGradePrompt({ ...ctx, question, answer: attempt.answer, english }),
        GRADE_SCHEMA,
      )
      attempt.grade = r.grade
      attempt.english = english && r.english ? r.english : undefined
      attempt.state = 'graded'
      delete attempt.error
      await saveAttempt(attempt)
    } catch (err) {
      attempt.state = 'pending'
      attempt.error = errorOf(err)
      await saveAttempt(attempt)
      return attempt
    }
    return attempt.grade?.ok ? recordAttempt(attempt) : attempt
  }

  /** Grades an mcq locally from its answer index. */
  function gradeMcq(question: Question, answer: string): Grade {
    const chosen = Number(answer)
    const correct = question.answer ?? -1
    const ok = chosen === correct
    return {
      ok,
      why: `Chose option ${letter(chosen)}; correct is ${letter(correct)}`,
      missing: [],
      feedback: ok ? 'Correct.' : question.misconceptions?.[chosen] || 'That option is not correct.',
    }
  }

  /** Writes the verdict into the vault; on failure the attempt stays graded with a record error. */
  async function recordAttempt(attempt: Attempt): Promise<Attempt> {
    if (attempt.state === 'recorded') return attempt
    const grade = attempt.grade
    if (!grade) throw new StudyError('bad-state', `Attempt ${attempt.id} has no grade to record`)
    try {
      // A crash between the vault write and saving the attempt must not write the entry twice.
      if (attempt.recordingStarted) {
        const done = await alreadyRecorded(attempt, grade)
        if (done) {
          attempt.record = done
          attempt.state = 'recorded'
          delete attempt.error
          await saveAttempt(attempt)
          return attempt
        }
      }
      attempt.recordingStarted = true
      await saveAttempt(attempt)
      const result = await tutor.record({
        point: attempt.point,
        ok: grade.ok,
        kind: attempt.kind,
        q: attempt.q,
        why: grade.why,
        date: attempt.date,
      })
      attempt.record = result
      attempt.state = 'recorded'
      delete attempt.error
    } catch (err) {
      attempt.state = 'graded'
      attempt.error = { code: 'record', message: messageOf(err) }
    }
    await saveAttempt(attempt)
    return attempt
  }

  /** The vault's result for this attempt if its history entry is already there, else null. */
  async function alreadyRecorded(attempt: Attempt, grade: Grade): Promise<RecordResult | null> {
    const point = await findPoint(attempt.point)
    const hit = point.history.some(
      (h) => h.d === attempt.date && h.q === attempt.q && h.kind === attempt.kind && h.ok === grade.ok && h.why === grade.why,
    )
    if (!hit) return null
    return { point: point.id, mastery: point.mastery, status: point.status, passed_gate: point.status === 'mastered', box: point.box, next_review: point.next_review }
  }

  /** Re-grades a pending attempt, or only records a graded one. */
  async function retry(attemptId: string): Promise<Attempt> {
    const found = await attemptOrFail(attemptId)
    claim(found.point)
    try {
      const state = await store.read()
      const attempt = state.attempts.find((a) => a.id === attemptId)
      if (!attempt) throw new StudyError('not-found', `No attempt ${attemptId}`)
      if (attempt.state === 'pending') {
        const question = state.banks[attempt.point]?.questions.find((q) => q.q === attempt.q)
        if (!question) throw new StudyError('bad-state', `Question ${attempt.q} is gone from the bank`)
        return await gradeAttempt(attempt, question)
      }
      if (attempt.state === 'graded') return await recordAttempt(attempt)
      throw new StudyError('bad-state', `Attempt ${attemptId} is ${attempt.state}`)
    } finally {
      busy.delete(found.point)
    }
  }

  /** Records a graded attempt as it stands. */
  async function confirm(attemptId: string): Promise<Attempt> {
    const found = await attemptOrFail(attemptId)
    claim(found.point)
    try {
      const attempt = (await store.read()).attempts.find((a) => a.id === attemptId)
      if (!attempt) throw new StudyError('not-found', `No attempt ${attemptId}`)
      if (attempt.state !== 'graded') throw new StudyError('bad-state', `Attempt ${attemptId} is ${attempt.state}`)
      return await recordAttempt(attempt)
    } finally {
      busy.delete(found.point)
    }
  }

  /** Re-grades a failed open answer with the learner's argument, then records the new verdict. */
  async function appeal(attemptId: string, reason: string): Promise<Attempt> {
    const found = await attemptOrFail(attemptId)
    claim(found.point)
    try {
      const state = await store.read()
      const attempt = state.attempts.find((a) => a.id === attemptId)
      if (!attempt) throw new StudyError('not-found', `No attempt ${attemptId}`)
      const question = state.banks[attempt.point]?.questions.find((q) => q.q === attempt.q)
      const appealable = attempt.state === 'graded' && question?.kind === 'open' && attempt.grade?.ok === false && !attempt.appealed
      if (!appealable) throw new StudyError('bad-state', `Attempt ${attemptId} cannot be appealed`)
      attempt.appealed = true
      attempt.appeal = reason
      try {
        const english = state.settings.englishFeedback
        const ctx = await contextFor(attempt.point)
        const r = await ask<GradeResponse>(
          buildGradePrompt({ ...ctx, question: question!, answer: attempt.answer, english, appeal: reason }),
          GRADE_SCHEMA,
        )
        attempt.grade = r.grade
        attempt.english = english && r.english ? r.english : undefined
        delete attempt.error
      } catch (err) {
        attempt.appealed = false
        delete attempt.appeal
        attempt.error = errorOf(err)
        await saveAttempt(attempt)
        return attempt
      }
      return await recordAttempt(attempt)
    } finally {
      busy.delete(found.point)
    }
  }

  /** Creates the attempt before grading it, so a Claude failure never loses the answer. */
  async function submit(a: SubmitArgs): Promise<Attempt> {
    claim(a.point)
    try {
      const state = await store.read()
      const open = state.attempts.some(
        (x) => x.point === a.point && (x.state === 'pending' || x.state === 'graded'),
      )
      if (open) throw new StudyError('bad-state', `Point ${a.point} has an open attempt`)
      const question = state.banks[a.point]?.questions.find((q) => q.q === a.q)
      if (!question || question.kind === 'pretest') {
        throw new StudyError('bad-state', `Question ${a.q} is not a main question of ${a.point}`)
      }
      if (question.kind === 'mcq' && !isOptionIndex(a.answer, question.options?.length ?? 0)) {
        throw new StudyError('bad-state', `Answer ${JSON.stringify(a.answer)} is not an option of ${a.q}`)
      }
      const attempt: Attempt = {
        id: newId(),
        point: a.point,
        q: a.q,
        kind: a.kind,
        answer: a.answer,
        date: today(),
        state: 'pending',
      }
      await saveAttempt(attempt)
      return await gradeAttempt(attempt, question)
    } finally {
      busy.delete(a.point)
    }
  }

  // --- Pretest --------------------------------------------------------------------

  /** Returns the key ideas for a skipped pretest, or grades a guess without ever recording. */
  async function submitPretest(pointId: string, answer: string | null): Promise<{ feedback: string }> {
    const bank = await getBank(pointId)
    const pretest = bank.questions.find((q) => q.kind === 'pretest')
    if (!pretest) throw new StudyError('bad-state', `Bank for ${pointId} has no pretest`)
    if (answer === null) return { feedback: `Key idea: ${(pretest.criteria ?? []).join('; ')}` }
    const ctx = await contextFor(pointId)
    const r = await ask<GradeResponse>(
      buildGradePrompt({ ...ctx, question: pretest, answer, english: false }),
      GRADE_SCHEMA,
    )
    return { feedback: r.grade.feedback }
  }

  // --- Question selection ---------------------------------------------------------

  /** Picks the next question: the first never passed when learning, the stalest when reviewing. */
  function pickQuestion(point: Point, bank: QuestionBank, kind: 'learn' | 'review'): Question {
    const main = bank.questions.filter((q) => q.kind !== 'pretest')
    if (main.length === 0) throw new StudyError('bad-state', `Bank for ${point.id} has no main questions`)
    const history = point.history
    const fresh =
      kind === 'learn'
        ? main.find((q) => !history.some((h) => h.q === q.q && h.ok))
        : main.find((q) => !history.some((h) => h.q === q.q))
    if (fresh) return fresh
    return main.reduce((oldest, q) => (latestDate(history, q.q) < latestDate(history, oldest.q) ? q : oldest))
  }

  /** The most recent date any history entry carries for one question code, empty when unseen. */
  function latestDate(history: HistoryEntry[], code: string): string {
    return history.filter((h) => h.q === code).reduce((latest, h) => (h.d > latest ? h.d : latest), '')
  }

  // --- Attempts and settings ------------------------------------------------------

  /** All attempts still waiting for a retry, a confirm or an appeal. */
  async function openAttempts(): Promise<Attempt[]> {
    return (await store.read()).attempts.filter((a) => a.state === 'pending' || a.state === 'graded')
  }

  /** The attempts of one point, newest first. */
  async function attemptsFor(pointId: string): Promise<Attempt[]> {
    const attempts = (await store.read()).attempts
    return attempts
      .map((a, i) => ({ a, i }))
      .filter((x) => x.a.point === pointId)
      .sort((x, y) => (x.a.date === y.a.date ? y.i - x.i : x.a.date < y.a.date ? 1 : -1))
      .map((x) => x.a)
  }

  /** Merges the patch into the persisted settings. */
  async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return store.update((s) => {
      s.settings = { ...s.settings, ...patch }
      return { ...s.settings }
    })
  }

  /** Reads the persisted settings. */
  async function getSettings(): Promise<Settings> {
    return (await store.read()).settings
  }

  /** The last Claude failure seen by any method, null after a later success. */
  function lastClaudeError(): Attempt['error'] | null {
    return lastError ? { ...lastError } : null
  }

  // --- Prefetch -------------------------------------------------------------------

  const queue: string[] = []
  const queued = new Set<string>()
  let draining: Promise<void> | null = null

  /** Prepares lessons and banks in the background, queueing ids behind a running batch. */
  function prefetch(pointIds: string[]): Promise<void> {
    for (const id of pointIds) {
      if (queued.has(id)) continue
      queued.add(id)
      queue.push(id)
    }
    if (draining) return draining
    draining = drain()
      .catch(() => undefined)
      .finally(() => {
        draining = null
        if (queue.length > 0) void prefetch([])
      })
    return draining
  }

  /** Works through the queue one point at a time. */
  async function drain(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift() as string
      try {
        await preparePoint(id)
      } finally {
        queued.delete(id)
      }
    }
  }

  /** Lesson first for new points, then the bank; every failure is only logged. */
  async function preparePoint(id: string): Promise<void> {
    try {
      const point = await findPoint(id)
      if (point.status === 'new') await getLesson(id)
    } catch (err) {
      console.warn(`[study] prefetch lesson ${id}: ${messageOf(err)}`)
    }
    try {
      await getBank(id)
    } catch (err) {
      console.warn(`[study] prefetch bank ${id}: ${messageOf(err)}`)
    }
  }

  // --- Small helpers --------------------------------------------------------------

  /** Reads one attempt or fails with not-found. */
  async function attemptOrFail(attemptId: string): Promise<Attempt> {
    const attempt = (await store.read()).attempts.find((a) => a.id === attemptId)
    if (!attempt) throw new StudyError('not-found', `No attempt ${attemptId}`)
    return attempt
  }

  /** Turns a failed source lookup into a no-sources error. */
  function noSources(missing: string[]): StudyError {
    return new StudyError('no-sources', `No source note found: ${missing.join(', ')}`)
  }

  /** Maps an unknown error onto the attempt error shape. */
  function errorOf(err: unknown): NonNullable<Attempt['error']> {
    if (err instanceof ClaudeError) return { code: err.code, message: err.message }
    return { code: 'failed', message: messageOf(err) }
  }

  return {
    getLesson,
    getBank,
    regenerateBank,
    pickQuestion,
    submit,
    retry,
    confirm,
    appeal,
    submitPretest,
    openAttempts,
    attemptsFor,
    updateSettings,
    getSettings,
    prefetch,
    lastClaudeError,
  }
}

/** True when `answer` is a whole-number index of one of `count` options. */
function isOptionIndex(answer: string, count: number): boolean {
  return /^\d+$/.test(answer) && Number(answer) < count
}

/** The mcq option letter for an index, or "?" when it is out of range. */
function letter(index: number): string {
  return 'ABCD'[index] ?? '?'
}

/** A readable message for any thrown value. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

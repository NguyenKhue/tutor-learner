// Shared between the server and the UI.
export type PointType = 'memory' | 'procedure' | 'concept'
export type Status = 'new' | 'learning' | 'mastered'
export interface HistoryEntry { d: string; kind: 'learn' | 'review'; ok: boolean; q: string; why: string }
export interface Point { id: string; topic: string; type: PointType; interview: boolean; order: number; sources: string[]
  status: Status; mastery: number; box: number | null; next_review: string | null; history: HistoryEntry[] }
export interface ExportData { generated: string; config: TutorConfig; points: Point[]; skipped: unknown[] }
export interface TutorConfig { interview_date: string | null; interview_buffer_days: number; threshold: number; daily_review_cap: number }
export interface DuePoint { point: string; topic: string; type: PointType; interview: boolean; overdue_days: number }
export interface RecordResult { point: string; mastery: number; status: Status; passed_gate: boolean; box: number | null; next_review: string | null }

export type QuestionKind = 'pretest' | 'mcq' | 'open'
export interface Question { q: string; kind: QuestionKind; prompt: string
  options?: string[]; answer?: number; misconceptions?: string[]   // mcq: 4 options, answer index 0-3, misconceptions[i] for each wrong option
  criteria?: string[] }                                              // open: 2-4 required ideas; pretest: 1-3 key ideas
export interface QuestionBank { point: string; created: string; questions: Question[] }

export interface Grade { ok: boolean; why: string; missing: string[]; feedback: string }
export interface EnglishNotes { corrected: string; notes: string[] }
export type AttemptState = 'pending' | 'graded' | 'recorded' | 'failed'
export interface Attempt { id: string; point: string; q: string; kind: 'learn' | 'review'; answer: string; date: string
  state: AttemptState; grade?: Grade; english?: EnglishNotes; appealed?: boolean; appeal?: string; recordingStarted?: boolean
  record?: RecordResult; error?: { code: 'limit' | 'auth' | 'failed' | 'record'; message: string } }
export interface TodayList { date: string; review: string[]; fresh: string[]; extra: string[]; reading?: string[] }
export interface Settings { newPerDay: number; englishFeedback: boolean; readingReviewsPerDay: number }
export interface AppState { version: 1; banks: Record<string, QuestionBank>; attempts: Attempt[]; today: TodayList | null; settings: Settings; reading: ReadingState }
export interface Overview { today: string; export: ExportData; topicOrder: string[]; list: TodayList; settings: Settings; vaultName: string
  reading?: Record<string, { title: string; topic: string | null; done: boolean; kind: 'recheck' | 'reread' }> }

// Reading tab
export type ReadingPriority = 'high' | 'medium' | 'low' | 'skip'
export interface CatalogEntry { path: string; title: string; chars: number; mtime: number; hash: string
  topic?: string | null; priority?: ReadingPriority; minutes?: number; why?: string; classifiedHash?: string; isSource: boolean; present: boolean }
export interface ReadingQuiz { hash: string; questions: Question[] }          // kind 'open', q r1..r3
export interface ReadingResult { q: string; ok: boolean; why: string; missing: string[]; feedback: string }
export interface ReadingCheck { id: string; date: string; kind: 'first' | 'recheck'; quizHash: string; answers: Record<string, string>
  state: 'pending' | 'graded'; results?: ReadingResult[]; english?: Record<string, EnglishNotes>; passed?: boolean
  appealed?: boolean; appeal?: string; error?: { code: 'limit' | 'auth' | 'failed'; message: string } }
export interface ReadingProgress { skipped?: boolean; checks: ReadingCheck[] }
export type ReadingStatus = 'unread' | 'understood' | 'reread' | 'done'
export interface ReadingState { catalog: Record<string, CatalogEntry>; quizzes: Record<string, ReadingQuiz>; progress: Record<string, ReadingProgress> }
export interface ReadingItem extends CatalogEntry { status: ReadingStatus; skipped: boolean; nextCheck: string | null; rung: number; openCheck: ReadingCheck | null }
export interface ReadingOverview { items: ReadingItem[]; upNext: string[]; due: string[]; classify: { total: number; done: number; running: boolean; error: string | null } }

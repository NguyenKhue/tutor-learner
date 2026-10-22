import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { makeTestVault } from './testVault'
import { BadPath, lessonRelPath, obsidianUrl, readLesson, readPointText, readSources, resolveWikilink, writeLesson } from './vault'

let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
})

function vault() {
  const v = makeTestVault([{ topic: 'Kotlin', name: '01 Null safety', type: 'memory', order: 1 }], {
    files: {
      'Android/Coroutines/Suspend.md': '# Suspend\nbody A',
      'Books/Deep/Chapter 1/Q00 - Null.md': '# Q00\nbody B',
    },
  })
  cleanups.push(v.cleanup)
  return v.vault
}

test('resolves a full path link', () => {
  const v = vault()
  expect(resolveWikilink(v, '[[Android/Coroutines/Suspend]]')).toBe(path.join(v, 'Android/Coroutines/Suspend.md'))
})

test('resolves by basename', () => {
  const v = vault()
  expect(resolveWikilink(v, '[[Q00 - Null]]')).toBe(path.join(v, 'Books/Deep/Chapter 1/Q00 - Null.md'))
})

test('strips heading and alias', () => {
  const v = vault()
  expect(resolveWikilink(v, '[[Android/Coroutines/Suspend#Part two|suspend]]')).toBe(path.join(v, 'Android/Coroutines/Suspend.md'))
})

test('returns null for missing', () => {
  expect(resolveWikilink(vault(), '[[Nope/Missing]]')).toBeNull()
})

test('does not resolve outside the vault', () => {
  expect(resolveWikilink(vault(), '[[../../etc/passwd]]')).toBeNull()
})

test('readSources splits found and missing', () => {
  const v = vault()
  const r = readSources(v, ['[[Android/Coroutines/Suspend]]', '[[Nope]]'])
  expect(r.found).toEqual([{ link: '[[Android/Coroutines/Suspend]]', path: path.join(v, 'Android/Coroutines/Suspend.md'), text: '# Suspend\nbody A' }])
  expect(r.missing).toEqual(['[[Nope]]'])
})

test('readPointText returns question and scope', () => {
  expect(readPointText(vault(), 'Kotlin/01 Null safety')).toEqual({ question: 'What is 01 Null safety?', scope: 'Scope of 01 Null safety.' })
})

test('lessonRelPath mirrors the point id', () => {
  expect(lessonRelPath('Kotlin/01 Null safety')).toBe('Tutor/Lessons/Kotlin/01 Null safety.md')
})

test('writeLesson writes frontmatter and body', () => {
  const v = vault()
  writeLesson(v, 'Kotlin/01 Null safety', '## Lesson\nText')
  const text = fs.readFileSync(path.join(v, 'Tutor/Lessons/Kotlin/01 Null safety.md'), 'utf8')
  expect(text).toBe('---\ntutor: lesson\npoint: "[[Tutor/Points/Kotlin/01 Null safety|Null safety]]"\n---\n\n## Lesson\nText\n')
  expect(readLesson(v, 'Kotlin/01 Null safety')).toBe('## Lesson\nText\n')
})

test('readLesson returns null when missing', () => {
  expect(readLesson(vault(), 'Kotlin/01 Null safety')).toBeNull()
})

test('writeLesson refuses a symlinked Lessons folder', () => {
  const v = vault()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
  cleanups.push(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.symlinkSync(outside, path.join(v, 'Tutor/Lessons'))
  expect(() => writeLesson(v, 'Kotlin/01 Null safety', 'x')).toThrow(BadPath)
  expect(fs.readdirSync(outside)).toEqual([])
})

test('rejects ids with ..', () => {
  expect(() => writeLesson(vault(), '../../evil', 'x')).toThrow(BadPath)
  expect(() => lessonRelPath('Kotlin/../../x')).toThrow(BadPath)
})

test('obsidianUrl encodes vault and file without .md', () => {
  expect(obsidianUrl('Khue Vault', 'Tutor/Lessons/Kotlin/01 Null safety.md')).toBe(
    'obsidian://open?vault=Khue%20Vault&file=Tutor%2FLessons%2FKotlin%2F01%20Null%20safety',
  )
})

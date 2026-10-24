import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { CatalogEntry } from '../../src/lib/types'
import { makeTestVault } from '../testVault'
import { BadPath } from '../vault'
import { mergeCatalog, readNoteText, scanVault } from './catalog'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

function vault(files: Record<string, string>) {
  const v = makeTestVault([{ topic: 'Kotlin', name: '01 Null', type: 'memory', order: 1 }], { files })
  cleanup = v.cleanup
  return v.vault
}

test('lists notes outside Tutor and hidden folders', () => {
  const v = vault({
    'Android/A.md': 'a'.repeat(100),
    'Books/B/Chapter 1.md': 'b',
    '.obsidian/x.md': 'x',
    '.trash/t.md': 't',
    'node_modules/n.md': 'n',
    'Android/img.png': 'png',
  })
  const notes = scanVault(v)
  expect(notes.map((n) => n.path)).toEqual(['Android/A.md', 'Books/B/Chapter 1.md'])
  expect(notes[0]).toMatchObject({ title: 'A', chars: 100 })
  expect(notes[0].hash).toMatch(/^[0-9a-f]{40}$/)
})

test('skips long notes', () => {
  const v = vault({ 'Books/Whole book.md': 'x'.repeat(60_001), 'Books/Short.md': 'x'.repeat(60_000) })
  expect(scanVault(v).map((n) => n.path)).toEqual(['Books/Short.md'])
})

test('keeps classification across scans and marks missing notes not present', () => {
  const old: Record<string, CatalogEntry> = {
    'A.md': { path: 'A.md', title: 'A', chars: 1, mtime: 1, hash: 'old', topic: 'Kotlin', priority: 'high', minutes: 3, why: 'w', classifiedHash: 'old', isSource: false, present: true },
    'Gone.md': { path: 'Gone.md', title: 'Gone', chars: 1, mtime: 1, hash: 'g', topic: 'Kotlin', priority: 'low', isSource: false, present: true },
  }
  const merged = mergeCatalog(old, [{ path: 'A.md', title: 'A', chars: 2, mtime: 2, hash: 'new' }, { path: 'New.md', title: 'New', chars: 5, mtime: 2, hash: 'n' }], new Set(['New.md']))
  expect(merged['A.md']).toMatchObject({ hash: 'new', classifiedHash: 'old', topic: 'Kotlin', priority: 'high', present: true, isSource: false })
  expect(merged['Gone.md']).toMatchObject({ present: false, topic: 'Kotlin' })
  expect(merged['New.md']).toMatchObject({ present: true, isSource: true })
  expect(merged['New.md'].topic).toBeUndefined()
})

test('readNoteText reads a note and refuses .. and Tutor paths', () => {
  const v = vault({ 'Android/A.md': 'hello' })
  expect(readNoteText(v, 'Android/A.md')).toBe('hello')
  expect(() => readNoteText(v, '../x.md')).toThrow(BadPath)
  expect(() => readNoteText(v, 'Tutor/config.md')).toThrow(BadPath)
  expect(() => readNoteText(v, '/etc/hosts')).toThrow(BadPath)
  expect(() => readNoteText(v, 'Android/img.png')).toThrow(BadPath)
  fs.symlinkSync('/etc/hosts', path.join(v, 'Android/link.md'))
  expect(() => readNoteText(v, 'Android/link.md')).toThrow(BadPath)
})

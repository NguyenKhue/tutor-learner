import { afterEach, expect, test } from 'vitest'
import type { CatalogEntry } from '../../src/lib/types'
import { makeTestVault } from '../testVault'
import { buildVaultContext, EXCERPT_CHARS } from './context'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

function setup(files: Record<string, string>) {
  const v = makeTestVault([{ topic: 'Kotlin', name: '01 Null', type: 'memory', order: 1 }], { files })
  cleanup = v.cleanup
  return v.vault
}

const entry = (path: string, over: Partial<CatalogEntry> = {}): CatalogEntry =>
  ({ path, title: path.replace(/^.*\//, '').replace(/\.md$/, ''), chars: 0, mtime: 0, hash: '', isSource: false, present: true, topic: 'Coroutines', priority: 'medium', ...over }) as CatalogEntry

test('takes notes of the chosen topics, high priority first', () => {
  const vault = setup({ 'A/low.md': 'low text', 'A/high.md': '---\ntitle: x\n---\nhigh text', 'A/med.md': 'med text', 'A/other.md': 'other' })
  const catalog = {
    'A/low.md': entry('A/low.md', { priority: 'low' }),
    'A/high.md': entry('A/high.md', { priority: 'high' }),
    'A/med.md': entry('A/med.md'),
    'A/other.md': entry('A/other.md', { topic: 'Other', priority: 'high' }),
  }
  const out = buildVaultContext(vault, catalog, ['Coroutines'])
  expect(out.map((n) => n.path)).toEqual(['A/high.md', 'A/med.md', 'A/low.md'])
  expect(out[0]).toEqual({ path: 'A/high.md', title: 'high', text: 'high text' })
  expect(buildVaultContext(vault, catalog, ['Nothing'])).toEqual([])
})

test('never takes skipped or missing notes', () => {
  const vault = setup({ 'A/skip.md': 'skip', 'A/gone.md': 'gone', 'A/ok.md': 'ok' })
  const catalog = {
    'A/skip.md': entry('A/skip.md', { priority: 'skip' }),
    'A/gone.md': entry('A/gone.md', { present: false }),
    'A/nofile.md': entry('A/nofile.md'),
    'A/ok.md': entry('A/ok.md'),
  }
  expect(buildVaultContext(vault, catalog, ['Coroutines']).map((n) => n.path)).toEqual(['A/ok.md'])
})

test('stops at the budget and cuts long notes', () => {
  const vault = setup({ 'A/1.md': 'x'.repeat(EXCERPT_CHARS * 2), 'A/2.md': 'y'.repeat(EXCERPT_CHARS), 'A/3.md': 'z'.repeat(EXCERPT_CHARS) })
  const catalog = { 'A/1.md': entry('A/1.md', { priority: 'high' }), 'A/2.md': entry('A/2.md'), 'A/3.md': entry('A/3.md', { priority: 'low' }) }
  const out = buildVaultContext(vault, catalog, ['Coroutines'], EXCERPT_CHARS + 10)
  expect(out.map((n) => n.path)).toEqual(['A/1.md'])
  expect(out[0].text).toHaveLength(EXCERPT_CHARS)
  const all = buildVaultContext(vault, catalog, ['Coroutines'], EXCERPT_CHARS * 2)
  expect(all.map((n) => n.path)).toEqual(['A/1.md', 'A/2.md'])
})

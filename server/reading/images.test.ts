import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { makeTestVault } from '../testVault'
import { resolveVaultImage } from './images'

let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
})

function vault() {
  const v = makeTestVault([], {
    files: {
      'Books/B/Chapter.md': 'x',
      'Books/B/images/fig.jpg': 'jpg',
      'Mobile/images/diagram.svg': '<svg/>',
      'Android/note.md': 'n',
    },
  })
  cleanups.push(v.cleanup)
  return v.vault
}

test('finds an image next to the note', () => {
  const v = vault()
  expect(resolveVaultImage(v, 'Books/B/Chapter.md', 'images/fig.jpg')).toEqual({ file: fs.realpathSync(path.join(v, 'Books/B/images/fig.jpg')), type: 'image/jpeg' })
})

test('finds an image by basename', () => {
  const v = vault()
  expect(resolveVaultImage(v, 'Android/note.md', 'diagram.svg')).toEqual({ file: fs.realpathSync(path.join(v, 'Mobile/images/diagram.svg')), type: 'image/svg+xml' })
})

test('refuses paths outside the vault and non-images', () => {
  const v = vault()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'img-out-'))
  cleanups.push(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(outside, 'secret.png'), 'x')
  fs.symlinkSync(path.join(outside, 'secret.png'), path.join(v, 'Android/link.png'))
  expect(resolveVaultImage(v, 'Android/note.md', '../../' + path.basename(outside) + '/secret.png')).toBeNull()
  expect(resolveVaultImage(v, 'Android/note.md', path.join(outside, 'secret.png'))).toBeNull()
  expect(resolveVaultImage(v, 'Android/note.md', 'link.png')).toBeNull()
  expect(resolveVaultImage(v, 'Android/note.md', 'note.md')).toBeNull()
  expect(resolveVaultImage(v, 'Android/note.md', 'missing.png')).toBeNull()
})

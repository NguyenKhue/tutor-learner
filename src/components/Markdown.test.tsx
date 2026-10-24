import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { Markdown } from './Markdown'

const md = (text: string) => render(<MemoryRouter><Markdown text={text} /></MemoryRouter>)

test('renders a table inside a callout', () => {
  md('> [!info] Terminology\n> | Term | Meaning |\n> |---|---|\n> | Reply | A comment on a comment |\n\nAfter.')
  const quote = screen.getByRole('table').closest('blockquote')!
  expect(quote).not.toBeNull()
  expect(within(quote).getByRole('columnheader', { name: 'Term' })).toBeInTheDocument()
  expect(within(quote).getByRole('cell', { name: 'A comment on a comment' })).toBeInTheDocument()
  expect(within(quote).getByText('Terminology')).toBeInTheDocument()
  expect(screen.getByText('After.')).toBeInTheDocument()
})

test('renders a plain quote with a list', () => {
  md('> Note:\n> - one\n> - two')
  const quote = screen.getByText('Note:').closest('blockquote')!
  expect(within(quote).getAllByRole('listitem')).toHaveLength(2)
})

test('skips frontmatter', () => {
  md('---\ntags: [a]\n---\n# Title')
  expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
  expect(screen.queryByText(/tags/)).toBeNull()
})

test('shows images from the web', () => {
  render(<MemoryRouter><Markdown text="![DIP illustration](https://miro.medium.com/v2/resize:fit:700/1*Luy.png)" notePath="Android/DIP.md" /></MemoryRouter>)
  const img = screen.getByRole('img', { name: 'DIP illustration' })
  expect(img).toHaveAttribute('src', 'https://miro.medium.com/v2/resize:fit:700/1*Luy.png')
  expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
})

test('does not load other URL schemes as images', () => {
  render(<MemoryRouter><Markdown text="![x](javascript:alert(1))" notePath="A.md" /></MemoryRouter>)
  expect(screen.queryByRole('img')).toBeNull()
})

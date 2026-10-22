import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { goTo, mockApi } from '../test/api'
import { makeOverview } from '../test/fixtures'
import { App } from './App'

afterEach(() => vi.unstubAllGlobals())

test('renders the app shell', async () => {
  mockApi({ 'GET /api/overview': makeOverview() })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('Tutor')).toBeInTheDocument()
})

import { expect, test } from 'vitest'
import { defaultTopics } from './interview'
import { makePoint } from '../test/fixtures'

const order = ['Kotlin Language', 'Coroutines and Flow', 'Android']
const points = [
  makePoint('Kotlin Language/01 A'),
  makePoint('Coroutines and Flow/01 B', { status: 'learning' }),
  makePoint('Android/01 C'),
]

test('defaultTopics matches topic words in the job description and falls back to started topics', () => {
  expect(defaultTopics('We need strong KOTLIN skills', order, points)).toEqual(['Kotlin Language'])
  expect(defaultTopics('We use coroutines daily', order, points)).toEqual(['Coroutines and Flow'])
  expect(defaultTopics('Nothing relevant here', order, points)).toEqual(['Coroutines and Flow'])
  expect(defaultTopics('', order, points)).toEqual(['Coroutines and Flow'])
})

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

test('defaultTopics matches whole words only', () => {
  const none = [makePoint('Kotlin Language/01 A')] // nothing started, so no fallback
  expect(defaultTopics('workflow tooling', order, none)).toEqual([])
  expect(defaultTopics('the data flow of an app', order, none)).toEqual(['Coroutines and Flow'])
  expect(defaultTopics('c++ (kotlin) developer', order, none)).toEqual(['Kotlin Language'])
})

test('defaultTopics ignores generic topic words on their own', () => {
  const none = [makePoint('Kotlin Language/01 A')]
  const topics = ['Kotlin Language', 'System Design', 'Computer Science', 'Data and Testing', 'Algorithms and Data Structures']
  expect(defaultTopics('any programming language, system design, computer science, data testing', topics, none)).toEqual([])
  // a topic still matches through its other words
  expect(defaultTopics('we use Kotlin and algorithms', topics, none)).toEqual(['Kotlin Language', 'Algorithms and Data Structures'])
})

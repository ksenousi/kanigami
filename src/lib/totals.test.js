import { describe, expect, it } from 'vitest'
import { isFresh } from './totals.js'

// Only the pure judgement — the read/fetch/write around it is glue over
// localStorage and the network. Fake numbers, as everywhere.

const NOW = 1_000_000_000
const DAY = 24 * 60 * 60 * 1000

describe('isFresh', () => {
  const record = { radical: 500, kanji: 2100, vocabulary: 6700, at: NOW - DAY }

  it('keeps a record younger than a week', () => {
    expect(isFresh(record, NOW)).toBe(true)
  })

  it('lets a week-old record go', () => {
    expect(isFresh({ ...record, at: NOW - 8 * DAY }, NOW)).toBe(false)
  })

  it('refuses a record missing any kind', () => {
    expect(isFresh({ radical: 500, kanji: 2100, at: NOW }, NOW)).toBe(false)
    expect(isFresh({ ...record, vocabulary: 'many' }, NOW)).toBe(false)
  })

  it('refuses what is not a record at all', () => {
    expect(isFresh(null, NOW)).toBe(false)
    expect(isFresh({}, NOW)).toBe(false)
    expect(isFresh({ at: 'yesterday' }, NOW)).toBe(false)
  })
})

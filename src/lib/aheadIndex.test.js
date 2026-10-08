import { describe, expect, it } from 'vitest'
import { aheadByLevel, compact, isComplete, isFresh } from './aheadIndex.js'

const started = id => ({ data: { subject_id: id, started_at: '2026-01-01T00:00:00Z' } })

describe('compact', () => {
  it('keeps id, level and a letter for the type, and nothing else', () => {
    const subjects = [
      { id: 1, object: 'radical', data: { level: 1, meaning_mnemonic: 'never kept' } },
      { id: 2, object: 'vocabulary', data: { level: 2 } },
      { id: 3, object: 'kana_vocabulary', data: { level: 3 } },
      { id: 4, object: 'vocabulary', data: {} }
    ]
    expect(compact(subjects)).toEqual([[1, 1, 'r'], [2, 2, 'v'], [3, 3, 'v']])
  })
})

describe('aheadByLevel', () => {
  const INDEX = [[1, 1, 'r'], [2, 2, 'r'], [3, 2, 'v'], [4, 5, 'v'], [5, 5, 'v']]

  it('counts what is not started at or below each level', () => {
    const { radical, vocabulary } = aheadByLevel(INDEX, [started(1), started(4)], 6)
    expect(radical).toEqual([0, 0, 1, 1, 1, 1, 1])
    expect(vocabulary).toEqual([0, 0, 1, 1, 1, 2, 2])
  })

  it('counts a lesson not yet started as still ahead', () => {
    const { radical } = aheadByLevel(INDEX, [{ data: { subject_id: 1, started_at: null } }], 2)
    expect(radical).toEqual([0, 1, 2])
  })
})

describe('the record', () => {
  it('is fresh for a week and complete only with subjects in it', () => {
    const record = { at: 0, subjects: [[1, 1, 'r']] }
    expect(isComplete(record)).toBe(true)
    expect(isComplete({ at: 0, subjects: [] })).toBe(false)
    expect(isFresh(record, 6 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(isFresh(record, 8 * 24 * 60 * 60 * 1000)).toBe(false)
  })
})

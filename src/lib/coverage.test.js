import { describe, expect, it } from 'vitest'
import { coverage, taughtKanji, throughLevel } from './coverage.js'
import { compact, isComplete, isFresh } from './kanjiIndex.js'
import { JLPT, JOYO } from './kanjiLists.js'

// Fake ids and levels; the characters are ordinary kanji.
const INDEX = [[1, 1, '一'], [2, 1, '二'], [3, 2, '山'], [4, 3, '川'], [5, 9, '海']]
const started = (id, type = 'kanji') => ({ data: { subject_id: id, subject_type: type, started_at: '2026-01-01T00:00:00Z' } })

describe('taughtKanji', () => {
  it('maps started kanji to their characters, and nothing else', () => {
    const taught = taughtKanji(INDEX, [started(1), started(3), started(2, 'vocabulary'), { data: { subject_id: 4, subject_type: 'kanji', started_at: null } }])
    expect([...taught].sort()).toEqual(['一', '山'])
  })
})

describe('throughLevel', () => {
  it('adds every kanji up to the level to what is taught', () => {
    const all = throughLevel(INDEX, new Set(['海']), 2)
    expect([...all].sort()).toEqual(['一', '二', '山', '海'].sort())
  })
})

describe('coverage', () => {
  it('counts each group against the characters', () => {
    const rows = coverage([['a', '一二三'], ['b', '山川']], new Set(['一', '三', '川']))
    expect(rows).toEqual([{ name: 'a', total: 3, have: 2 }, { name: 'b', total: 2, have: 1 }])
  })
})

describe('the bundled lists', () => {
  const size = list => list.reduce((sum, [, kanji]) => sum + [...kanji].length, 0)

  it('hold the Jōyō list whole', () => {
    expect(size(JOYO)).toBe(2136)
    expect(new Set(JOYO.flatMap(([, k]) => [...k])).size).toBe(2136)
  })

  it('hold the five JLPT levels without overlap', () => {
    expect(JLPT.map(([name]) => name)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1'])
    expect(new Set(JLPT.flatMap(([, k]) => [...k])).size).toBe(size(JLPT))
  })
})

describe('kanjiIndex records', () => {
  it('keeps id, level and character, and drops a subject with no character', () => {
    const kept = compact([
      { id: 7, data: { level: 3, characters: '川' } },
      { id: 8, data: { level: 3, characters: null } }
    ])
    expect(kept).toEqual([[7, 3, '川']])
  })

  it('uses a week-old record only as a fallback', () => {
    const DAY = 86400000
    const record = { at: 0, kanji: [[1, 1, '一']] }
    expect(isFresh(record, 6 * DAY)).toBe(true)
    expect(isFresh(record, 8 * DAY)).toBe(false)
    expect(isComplete(record)).toBe(true)
    expect(isComplete({ at: 0, kanji: [] })).toBe(false)
  })
})

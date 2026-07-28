import { describe, expect, it } from 'vitest'
import {
  BANDS,
  dueNow,
  forecast,
  kanjiPassed,
  learned,
  lessonsWaiting,
  nextDue,
  peak,
  spread
} from './standing.js'

const at = stage => ({ data: { srs_stage: stage } })

// Hourly buckets in the shape /summary returns. Fake timestamps throughout.
const bucket = (hour, count) => ({
  available_at: `2026-07-27T${String(hour).padStart(2, '0')}:00:00.000Z`,
  subject_ids: Array.from({ length: count }, (_, i) => i + 1)
})

describe('spread', () => {
  it('puts every stage in the band people name it by', () => {
    const counted = spread([at(1), at(4), at(5), at(6), at(7), at(8), at(9)])
    expect(counted.bands.map(b => [b.key, b.count])).toEqual([
      ['apprentice', 2],
      ['guru', 2],
      ['master', 1],
      ['enlightened', 1],
      ['burned', 1]
    ])
    expect(counted.total).toBe(7)
  })

  it('covers all nine stages between its bands and no more', () => {
    expect(BANDS.flatMap(b => [b.from, b.to])).toEqual([1, 4, 5, 6, 7, 7, 8, 8, 9, 9])
  })

  // Stage 0 is a lesson that has not been started. It is not on the scale.
  it('leaves out anything with no stage on it', () => {
    const counted = spread([at(0), at(null), {}, { data: {} }, at(3)])
    expect(counted.total).toBe(1)
    expect(counted.bands[0].count).toBe(1)
  })

  it('has a shape to draw even with nothing in it', () => {
    const counted = spread([])
    expect(counted.total).toBe(0)
    expect(counted.bands).toHaveLength(5)
  })

  it('does not mind being handed nothing at all', () => {
    expect(spread().total).toBe(0)
  })
})

describe('forecast', () => {
  const summary = {
    reviews: [bucket(9, 12), bucket(10, 0), bucket(11, 4), bucket(12, 0)]
  }

  it('counts each hour WaniKani bucketed', () => {
    expect(forecast(summary)).toEqual([
      { at: '2026-07-27T09:00:00.000Z', count: 12 },
      { at: '2026-07-27T10:00:00.000Z', count: 0 },
      { at: '2026-07-27T11:00:00.000Z', count: 4 },
      { at: '2026-07-27T12:00:00.000Z', count: 0 }
    ])
  })

  it('clips to the window asked for', () => {
    expect(forecast(summary, 2)).toHaveLength(2)
  })

  it('has nothing to draw for a summary that never arrived', () => {
    expect(forecast(null)).toEqual([])
    expect(forecast({})).toEqual([])
  })
})

describe('the counts on the door', () => {
  it('reads what is available now out of the first bucket', () => {
    expect(dueNow({ reviews: [bucket(9, 12), bucket(10, 3)] })).toBe(12)
  })

  it('reads lessons the same way', () => {
    expect(lessonsWaiting({ lessons: [{ subject_ids: [1, 2, 3] }] })).toBe(3)
  })

  it('says nothing is due rather than throwing on an empty summary', () => {
    expect(dueNow({})).toBe(0)
    expect(dueNow(null)).toBe(0)
    expect(lessonsWaiting(null)).toBe(0)
  })
})

describe('nextDue', () => {
  it('is the current hour when something is already waiting', () => {
    const summary = { reviews: [bucket(9, 12), bucket(10, 4)] }
    expect(nextDue(summary)).toBe('2026-07-27T09:00:00.000Z')
  })

  it('skips the empty hours to the first with anything in it', () => {
    const summary = { reviews: [bucket(9, 0), bucket(10, 0), bucket(11, 4)] }
    expect(nextDue(summary)).toBe('2026-07-27T11:00:00.000Z')
  })

  it('is nothing when the next 24 hours are empty', () => {
    expect(nextDue({ reviews: [bucket(9, 0), bucket(10, 0)] })).toBe(null)
    expect(nextDue(null)).toBe(null)
  })
})

describe('kanjiPassed', () => {
  const kanji = passedAt => ({ data: { passed_at: passedAt } })
  const reached = (passed, count) =>
    Array.from({ length: count }, (_, i) => kanji(i < passed ? '2026-07-01T00:00:00.000Z' : null))

  it('counts the ones with a passed date against the level', () => {
    expect(kanjiPassed(reached(1, 3), 3)).toMatchObject({ passed: 1, total: 3 })
  })

  it('wants 90% of the level, rounded up to a whole kanji', () => {
    expect(kanjiPassed([], 29)).toMatchObject({ needed: 27, remaining: 27 })
    expect(kanjiPassed([], 30)).toMatchObject({ needed: 27, remaining: 27 })
    expect(kanjiPassed([], 20)).toMatchObject({ needed: 18, remaining: 18 })
    // 90% of one is not one, and you cannot pass nine tenths of a kanji.
    expect(kanjiPassed([], 1)).toMatchObject({ needed: 1, remaining: 1 })
  })

  it('counts down to the threshold, not to the whole level', () => {
    // Twenty-nine kanji wants twenty-seven; the last two are slack.
    expect(kanjiPassed(reached(18, 29), 29)).toMatchObject({ passed: 18, remaining: 9 })
  })

  // Level-up is WaniKani's to declare and there is a beat before it does, so
  // the count has to survive going past its own threshold.
  it('never counts below zero once the threshold is met', () => {
    expect(kanjiPassed(reached(28, 29), 29)).toMatchObject({ needed: 27, remaining: 0 })
  })

  // The denominator is the level's kanji, not the ones unlocked so far —
  // early in a level those are far apart, and the assignments only cover the
  // second. Four reached out of thirty-two still wants twenty-nine.
  it('takes the total from the level rather than from the assignments', () => {
    expect(kanjiPassed(reached(0, 4), 32)).toMatchObject({ total: 32, needed: 29, remaining: 29 })
  })

  it('is zero of zero at the start of a level', () => {
    expect(kanjiPassed([], 0)).toEqual({ passed: 0, total: 0, needed: 0, remaining: 0 })
    expect(kanjiPassed()).toEqual({ passed: 0, total: 0, needed: 0, remaining: 0 })
  })
})

describe('peak', () => {
  it('is the tallest hour, which is what sets the scale', () => {
    expect(peak([{ count: 3 }, { count: 19 }, { count: 0 }])).toBe(19)
  })

  it('is zero when there is nothing to scale against', () => {
    expect(peak([])).toBe(0)
    expect(peak([{ count: 0 }, { count: 0 }])).toBe(0)
  })
})

describe('learned', () => {
  const of = type => ({ data: { subject_type: type } })

  it('counts what has been taught, by kind', () => {
    expect(learned([of('radical'), of('kanji'), of('kanji'), of('vocabulary')])).toEqual({
      radical: 1,
      kanji: 2,
      vocabulary: 1,
      total: 4
    })
  })

  // The same rule the glyph and the question line already follow.
  it('counts kana vocabulary as vocabulary', () => {
    expect(learned([of('vocabulary'), of('kana_vocabulary')])).toMatchObject({
      vocabulary: 2,
      total: 2
    })
  })

  it('ignores anything it does not recognise rather than inventing a bucket', () => {
    expect(learned([of('radical'), of('something_new'), {}, { data: {} }])).toEqual({
      radical: 1,
      kanji: 0,
      vocabulary: 0,
      total: 1
    })
  })

  it('is all zeros at the very beginning', () => {
    expect(learned([])).toEqual({ radical: 0, kanji: 0, vocabulary: 0, total: 0 })
    expect(learned()).toEqual({ radical: 0, kanji: 0, vocabulary: 0, total: 0 })
  })
})

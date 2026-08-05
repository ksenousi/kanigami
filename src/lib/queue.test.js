import { describe, expect, it } from 'vitest'
import { LESSON_BATCH, batchSize } from './queue.js'

// Only the pure part of the queue — the loaders themselves are fetch-glue
// and stay untested rather than earn a mocked network.

describe('batchSize', () => {
  it('is the size the user chose on WaniKani', () => {
    expect(batchSize({ preferences: { lessons_batch_size: 3 } })).toBe(3)
    expect(batchSize({ preferences: { lessons_batch_size: 10 } })).toBe(10)
  })

  it('falls back to the default when the user carries no preference', () => {
    expect(batchSize({ preferences: {} })).toBe(LESSON_BATCH)
    expect(batchSize({})).toBe(LESSON_BATCH)
    expect(batchSize()).toBe(LESSON_BATCH)
  })

  it('does not let a nonsense size empty the batch', () => {
    expect(batchSize({ preferences: { lessons_batch_size: 0 } })).toBe(LESSON_BATCH)
    expect(batchSize({ preferences: { lessons_batch_size: -2 } })).toBe(LESSON_BATCH)
    expect(batchSize({ preferences: { lessons_batch_size: '5' } })).toBe(LESSON_BATCH)
  })
})

import { describe, expect, it } from 'vitest'
import { asPace } from './pace.js'

// Only the pure judgement — the read/write pair is a localStorage mirror of
// it and follows wherever this goes.

describe('asPace', () => {
  it('accepts a whole number of lessons within WaniKani bounds', () => {
    expect(asPace(15)).toBe(15)
    expect(asPace(1)).toBe(1)
    expect(asPace(100)).toBe(100)
  })

  it('reads the string an input hands over', () => {
    expect(asPace('15')).toBe(15)
    expect(asPace(' 15 ')).toBe(15)
  })

  it('treats empty as no pace at all', () => {
    expect(asPace('')).toBe(null)
    expect(asPace('   ')).toBe(null)
    expect(asPace(null)).toBe(null)
    expect(asPace(undefined)).toBe(null)
  })

  it("refuses what is not a pace, including WaniKani's own zero", () => {
    expect(asPace(0)).toBe(null)
    expect(asPace(101)).toBe(null)
    expect(asPace(-5)).toBe(null)
    expect(asPace(7.5)).toBe(null)
    expect(asPace('a few')).toBe(null)
  })
})

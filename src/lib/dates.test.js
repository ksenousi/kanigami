import { describe, expect, it } from 'vitest'
import { clock, count, dayMonth, dayMonthYear, monthYear, roughly, when } from './dates.js'

// Local times, so the expectations hold in any timezone.
const AT = new Date(2026, 9, 7, 19, 5) // Wed 7 Oct 2026, 19:05

describe('dates', () => {
  it('has one shape for each, whatever the locale', () => {
    expect(clock(AT)).toBe('19:05')
    expect(dayMonth(AT)).toBe('7 Oct')
    expect(dayMonthYear(AT)).toBe('7 Oct 2026')
    expect(monthYear(new Date(2027, 8, 1))).toBe('Sep 2027')
  })

  it('says today, or the day, for a moment', () => {
    expect(when(AT, new Date(2026, 9, 7, 8))).toBe('today 19:05')
    expect(when(AT, new Date(2026, 9, 5, 8))).toBe('Wed 7 Oct 19:05')
  })

  it('rounds a far projection to the month', () => {
    const now = new Date(2026, 9, 4)
    expect(roughly(new Date(2026, 9, 20), now)).toBe('20 Oct')
    expect(roughly(new Date(2027, 5, 20), now)).toBe('Jun 2027')
  })

  it('groups thousands the same way everywhere', () => {
    expect(count(12345)).toBe('12,345')
  })
})

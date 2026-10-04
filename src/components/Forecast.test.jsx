// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import Forecast from './Forecast.jsx'
import { cleanup, hover, key, render, tap, unhover } from '../test/dom.js'

// The summary's 25 hourly buckets — now and the 24 after. Fake counts,
// fake ids.
const HOUR = 60 * 60 * 1000
const START = Date.UTC(2026, 0, 5, 9)
const COUNTS = [38, 12, 7, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 9, 31, 18, 0, 0, 6, 14, 0, 3, 0, 0]
const summary = {
  lessons: [],
  reviews: COUNTS.map((count, i) => ({
    available_at: new Date(START + i * HOUR).toISOString(),
    subject_ids: Array.from({ length: count }, (_, j) => i * 100 + j)
  }))
}

const label = host => host.querySelector('.when').textContent
const hours = host => host.querySelectorAll('.hour')

afterEach(cleanup)

describe('Forecast', () => {
  it('rests on what is due now, and says the hours can be read', async () => {
    const host = await render(<Forecast summary={summary} />)
    expect(label(host)).toBe('38 due')
    expect(host.querySelector('.hint').textContent).toContain('an hour')
  })

  it('reads an hour under the mouse and lets go when it leaves', async () => {
    const host = await render(<Forecast summary={summary} />)
    await hover(hours(host)[2])
    expect(label(host)).toMatch(/· 7$/)
    await unhover(hours(host)[2])
    expect(label(host)).toBe('38 due')
  })

  it('holds an hour a finger taps, through the leave the lift sends', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    expect(label(host)).toMatch(/· 7$/)
    expect(hours(host)[2].classList.contains('reading')).toBe(true)
  })

  it('lets go when the same hour is tapped again', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(hours(host)[2])
    expect(label(host)).toBe('38 due')
  })

  it('moves to another hour when a different one is tapped', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(hours(host)[15])
    expect(label(host)).toMatch(/· 31$/)
  })

  it('lets go when a tap lands outside the strip', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(document.body)
    expect(label(host)).toBe('38 due')
  })

  it('walks the hours from the keyboard', async () => {
    const host = await render(<Forecast summary={summary} />)
    const strip = host.querySelector('.hours')
    await key(strip, 'ArrowRight')
    expect(label(host)).toBe('38 due now')
    await key(strip, 'ArrowRight')
    expect(label(host)).toMatch(/· 12$/)
    await key(strip, 'End')
    expect(label(host)).toMatch(/none$/)
    await key(strip, 'Escape')
    expect(label(host)).toBe('38 due')
  })
})

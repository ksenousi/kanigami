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

const label = host => host.querySelector('.readout .soft').textContent
const hours = host => host.querySelectorAll('.hour')
const RESTING = /^38 due now · 106 more by this time tomorrow$/

afterEach(cleanup)

describe('Forecast', () => {
  it('names every hour under its bar, bright where reviews arrive', async () => {
    const host = await render(<Forecast summary={summary} />)
    const names = [...host.querySelectorAll('.at')]
    expect(names).toHaveLength(25)
    const first = new Date(START).getHours()
    expect(names[0].textContent).toBe(String(first).padStart(2, '0'))
    expect(names[1].textContent).toBe(String((first + 1) % 24).padStart(2, '0'))
    expect(hours(host)[1].classList.contains('busy')).toBe(true) // 12 reviews
    expect(hours(host)[4].classList.contains('busy')).toBe(false) // none
  })

  it('names today, and the next day where it begins', async () => {
    const host = await render(<Forecast summary={summary} />)
    const days = [...host.querySelectorAll('.days span')].map(d => d.textContent)
    expect(days[0]).toBe('today')
    expect(days[1]).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
  })

  it('sets the next day’s hours apart from midnight on', async () => {
    const host = await render(<Forecast summary={summary} />)
    const all = [...hours(host)]
    const first = all.findIndex(h => h.classList.contains('next-day'))
    expect(first).toBeGreaterThan(0)
    expect(all[first].classList.contains('midnight')).toBe(true)
    expect(all[first].querySelector('.at').textContent).toBe('00')
    expect(all.slice(first).every(h => h.classList.contains('next-day'))).toBe(true)
    expect(all.slice(0, first).some(h => h.classList.contains('next-day'))).toBe(false)
  })

  it('prints each count on its bar, and stops a backlog bigger than the day at the top', async () => {
    const host = await render(<Forecast summary={summary} />)
    const counts = [...host.querySelectorAll('.n')].map(n => n.textContent)
    // 38 due now is more than the busiest hour after it (31), so it is capped
    expect(counts[0]).toBe('38↑')
    expect(counts).toContain('31')
    expect(hours(host)[0].querySelector('i').style.height).toBe(hours(host)[15].querySelector('i').style.height)
  })

  it('rests on what is due now and the day’s total, and says the bars can be read', async () => {
    const host = await render(<Forecast summary={summary} />)
    expect(label(host)).toMatch(RESTING)
    expect(host.querySelector('.readout').textContent).toContain('a bar for its hour')
  })

  it('says when the next ones come when nothing is due', async () => {
    const quiet = { ...summary, reviews: summary.reviews.map((r, i) => (i === 0 ? { ...r, subject_ids: [] } : r)) }
    const host = await render(<Forecast summary={quiet} />)
    expect(label(host)).toMatch(/^Nothing due now · next at \d\d:\d\d · 106 by this time tomorrow$/)
  })

  it('reads an hour under the mouse as its slot, and lets go when it leaves', async () => {
    const host = await render(<Forecast summary={summary} />)
    await hover(hours(host)[2])
    expect(label(host)).toMatch(/^\d\d:00–\d\d:00 · 7 reviews$/)
    await unhover(hours(host)[2])
    expect(label(host)).toMatch(RESTING)
  })

  it('holds an hour a finger taps, through the leave the lift sends', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    expect(label(host)).toMatch(/· 7 reviews$/)
    expect(hours(host)[2].classList.contains('reading')).toBe(true)
  })

  it('lets go when the same hour is tapped again', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(hours(host)[2])
    expect(label(host)).toMatch(RESTING)
  })

  it('moves to another hour when a different one is tapped', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(hours(host)[15])
    expect(label(host)).toMatch(/· 31 reviews$/)
  })

  it('lets go when a tap lands outside the chart', async () => {
    const host = await render(<Forecast summary={summary} />)
    await tap(hours(host)[2])
    await tap(document.body)
    expect(label(host)).toMatch(RESTING)
  })

  it('marks the kanji the level-up waits on above their bar, and names them', async () => {
    const at = i => new Date(START + i * HOUR + 30 * 60 * 1000).toISOString()
    const waitingOn = [
      { characters: '薬', stage: 4, availableAt: at(2) },
      { characters: '皿', stage: 4, availableAt: at(2) },
      { characters: '涙', stage: 1, availableAt: at(3) },
      { characters: '汗', stage: 0, availableAt: null }, // in lessons: nothing to mark
      { characters: '鼻', stage: 2, availableAt: at(40) } // past the chart
    ]
    const host = await render(<Forecast summary={summary} waitingOn={waitingOn} nextLevel={16} />)
    const marks = [...host.querySelectorAll('.mark')]
    expect(marks.map(m => m.textContent)).toEqual(['薬皿', '涙'])
    expect(marks[0].classList.contains('quiet')).toBe(false)
    expect(marks[1].classList.contains('quiet')).toBe(true)
    await hover(hours(host)[2])
    expect(label(host)).toMatch(/· 7 reviews · 薬 to pass, 皿 to pass$/)
    expect(host.querySelector('.readout').textContent).toContain('level 16 waits on')
  })

  it('marks nothing without a level-up to wait on', async () => {
    const host = await render(<Forecast summary={summary} />)
    expect(host.querySelector('.mark')).toBeNull()
    expect(host.querySelector('.readout').textContent).not.toContain('waits on')
  })

  it('walks the hours from the keyboard', async () => {
    const host = await render(<Forecast summary={summary} />)
    const chart = host.querySelector('.hours')
    await key(chart, 'ArrowRight')
    expect(label(host)).toBe('Now · 38 due')
    await key(chart, 'ArrowRight')
    expect(label(host)).toMatch(/· 12 reviews$/)
    await key(chart, 'End')
    expect(label(host)).toMatch(/· none$/)
    await key(chart, 'Escape')
    expect(label(host)).toMatch(RESTING)
  })
})

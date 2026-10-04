// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/wanikani.js'
import Dashboard from './Dashboard.jsx'
import { button, cleanup, click, hover, render, settle, tap, unhover } from '../test/dom.js'

// The whole API client, replaced. Every read answers with the smallest
// hand-written object the board reads — fake ids, a fake user, no account.
vi.mock('../lib/wanikani.js', () => ({
  getUser: vi.fn(),
  getSummary: vi.fn(),
  getStartedAssignments: vi.fn(),
  getLevelKanji: vi.fn(),
  getLevelKanjiSubjects: vi.fn(),
  getLevelRadicals: vi.fn(),
  getReviewStatistics: vi.fn(),
  getLevelProgressions: vi.fn(),
  getSpacedRepetitionSystems: vi.fn(),
  getSubjects: vi.fn(),
  getSubjectTotals: vi.fn()
}))

const TOKEN = '00000000-0000-0000-0000-000000000000'
const USER = { username: 'tester', level: 5 }
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

function subject(id, characters, meaning) {
  return { id, data: { characters, meanings: [{ meaning, primary: true }], lesson_position: id } }
}

function answer() {
  const now = Date.now()
  api.getUser.mockResolvedValue(USER)
  api.getSummary.mockResolvedValue({
    lessons: [{ subject_ids: [91, 92] }],
    reviews: [
      { available_at: new Date(now).toISOString(), subject_ids: [1, 2, 3] },
      { available_at: new Date(now + HOUR).toISOString(), subject_ids: [4] }
    ]
  })
  api.getStartedAssignments.mockResolvedValue([])
  api.getLevelKanjiSubjects.mockResolvedValue([subject(1, '山', 'Mountain'), subject(2, '川', 'River')])
  api.getLevelKanji.mockResolvedValue([
    { data: { subject_id: 1, srs_stage: 2, started_at: new Date(now).toISOString(), available_at: new Date(now + HOUR).toISOString() } }
  ])
  api.getReviewStatistics.mockResolvedValue([])
  api.getLevelProgressions.mockResolvedValue([])
  api.getSpacedRepetitionSystems.mockResolvedValue([])
  api.getSubjects.mockResolvedValue([])
  api.getSubjectTotals.mockResolvedValue({ radical: 10, kanji: 20, vocabulary: 30 })
  api.getLevelRadicals.mockResolvedValue([[], []])
}

async function board(props = {}) {
  const host = await render(
    <Dashboard token={TOKEN} user={USER} onUser={() => {}} onDisconnect={() => {}} {...props} />
  )
  await settle()
  return host
}

// Coming back to the tab: jsdom's document is not visible on its own.
async function comeBack() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
  await settle()
}

const readout = host => host.querySelector('.readout').textContent

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  answer()
})

afterEach(async () => {
  await cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the board', () => {
  it('draws the figures from the core reads', async () => {
    const host = await board()
    const figures = host.querySelector('.figures').textContent
    expect(figures).toContain('3reviews due')
    expect(figures).toContain('2lessons waiting')
  })

  it('says when the figures were read', async () => {
    const host = await board()
    expect(host.querySelector('.masthead').textContent).toMatch(/read \d/)
  })
})

describe('Disconnect', () => {
  it('asks in place before it acts', async () => {
    const onDisconnect = vi.fn()
    const host = await board({ onDisconnect })
    await click(button(host, 'Disconnect'))
    expect(onDisconnect).not.toHaveBeenCalled()
    await click(button(host, 'Confirm disconnect'))
    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it('calms down after a few seconds untouched', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onDisconnect = vi.fn()
    const host = await board({ onDisconnect })
    await click(button(host, 'Disconnect'))
    await vi.advanceTimersByTimeAsync(4100)
    await settle()
    expect(button(host, 'Disconnect')).toBeTruthy()
    await click(button(host, 'Disconnect'))
    expect(onDisconnect).not.toHaveBeenCalled()
  })
})

describe('reading again', () => {
  it('leaves a fresh board alone when the tab comes back', async () => {
    await board()
    await comeBack()
    expect(api.getUser).not.toHaveBeenCalled()
    expect(api.getSummary).toHaveBeenCalledOnce()
  })

  it('reads everything again when the tab comes back stale', async () => {
    await board()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 11 * MINUTE)
    await comeBack()
    expect(api.getUser).toHaveBeenCalledOnce()
    expect(api.getSummary).toHaveBeenCalledTimes(2)
  })

  it('reads again when the network comes back, if stale', async () => {
    await board()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * MINUTE)
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(api.getSummary).toHaveBeenCalledTimes(2)
  })

  it('hands a level-up to the app instead of reading the old level', async () => {
    const onUser = vi.fn()
    await board({ onUser })
    api.getUser.mockResolvedValue({ ...USER, level: 6 })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * MINUTE)
    await comeBack()
    expect(onUser).toHaveBeenCalledWith({ ...USER, level: 6 })
    expect(api.getSummary).toHaveBeenCalledOnce()
  })

  it('keeps the board when a re-read fails, and says it is old', async () => {
    const host = await board()
    api.getSummary.mockRejectedValue(Object.assign(new Error('WaniKani could not be reached.'), { status: 0 }))
    await click(host.querySelector('.masthead button'))
    await settle()
    expect(host.querySelector('.figures')).toBeTruthy()
    expect(host.querySelector('.masthead').textContent).toContain('not updated')
  })

  it('gives the board up only when the token is refused', async () => {
    const host = await board()
    api.getUser.mockRejectedValue(Object.assign(new Error('That token was rejected.'), { status: 401 }))
    await click(host.querySelector('.masthead button'))
    await settle()
    expect(host.querySelector('.figures')).toBeNull()
    expect(host.textContent).toContain('That token was rejected.')
  })
})

describe('the pace dial', () => {
  const DAY = 24 * HOUR
  // Levels 1–4 at 10 days each, level 5 unlocked 4 days ago. Fake dates.
  function history() {
    const now = Date.now()
    const start = now - 44 * DAY
    api.getLevelProgressions.mockResolvedValue([
      ...[0, 1, 2, 3].map(i => ({
        data: { level: i + 1, unlocked_at: new Date(start + i * 10 * DAY).toISOString(), passed_at: new Date(start + (i + 1) * 10 * DAY).toISOString(), abandoned_at: null }
      })),
      { data: { level: 5, unlocked_at: new Date(now - 4 * DAY).toISOString(), passed_at: null, abandoned_at: null } }
    ])
  }

  async function slide(host, value) {
    const input = host.querySelector('#pace-dial')
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(input, String(value))
    await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
  }

  const readings = host => host.querySelector('.dial .readings').textContent
  const road = host => [...host.querySelectorAll('.road .when')].map(w => w.textContent)

  it('starts at the median, and says so', async () => {
    history()
    const host = await board()
    expect(host.querySelector('#pace-dial').value).toBe('10')
    expect(readings(host)).toContain('10days a level')
    expect(host.querySelector('.dial .readout').textContent).toContain('Your median pace')
  })

  it('moves level 60 and the road with it, and says by how much', async () => {
    history()
    const host = await board()
    const before = [readings(host), road(host)]
    await slide(host, 7)
    expect(readings(host)).toContain('7days a level')
    expect(readings(host)).not.toBe(before[0])
    expect(road(host)).not.toEqual(before[1])
    expect(host.querySelector('.dial .readout').textContent).toMatch(/\d+ weeks sooner than at your median/)
    expect(host.querySelector('.road .head').textContent).toContain('7 days a level')
  })

  it('draws a slot for every level, the ones ahead as projections', async () => {
    history()
    const host = await board()
    const slots = host.querySelectorAll('.dial .bars > span:not(.pace-line):not(.median-line)')
    expect(slots).toHaveLength(60)
    expect(slots[4].classList.contains('current')).toBe(true)
    expect(slots[5].classList.contains('ahead')).toBe(true)
  })

  it('reads a projected level when one is tapped', async () => {
    history()
    const host = await board()
    await tap(host.querySelectorAll('.dial .bars > span')[29])
    expect(host.querySelector('.dial .readout .usual:not(.hidden)').textContent).toMatch(/^Level 30 ≈ .+ at 10 days a level$/)
  })

  it('stays away until a level has passed', async () => {
    const host = await board()
    expect(host.querySelector('#pace-dial')).toBeNull()
  })
})

describe('the level’s kanji', () => {
  const cell = (host, i) => host.querySelectorAll('.kanji li')[i]

  it('reads a kanji under the mouse and lets go when it leaves', async () => {
    const host = await board()
    await hover(cell(host, 0))
    expect(readout(host)).toContain('山 Mountain · apprentice II')
    await unhover(cell(host, 0))
    expect(host.querySelector('.readout .usual:not(.hidden)').textContent).toContain('Point at')
  })

  it('holds a tapped kanji until the next tap', async () => {
    const host = await board()
    await tap(cell(host, 0))
    expect(cell(host, 0).classList.contains('reading')).toBe(true)
    expect(host.querySelector('.readout .usual:not(.hidden)').textContent).toContain('山 Mountain')
    await tap(cell(host, 1))
    expect(host.querySelector('.readout .usual:not(.hidden)').textContent).toContain('川 River · locked')
    await tap(document.body)
    expect(host.querySelector('.kanji li.reading')).toBeNull()
  })

  it('carries each cell’s words for a screen reader', async () => {
    const host = await board()
    expect(cell(host, 1).querySelector('.sr-only').textContent).toBe('川 River: locked, Not unlocked yet')
  })
})

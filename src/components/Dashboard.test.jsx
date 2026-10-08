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
  getLevelAssignments: vi.fn(),
  getLevelKanji: vi.fn(),
  getLevelKanjiSubjects: vi.fn(),
  getLevelRadicals: vi.fn(),
  getLevelVocabulary: vi.fn(),
  getReviewStatistics: vi.fn(),
  getLevelProgressions: vi.fn(),
  getSpacedRepetitionSystems: vi.fn(),
  getSubjects: vi.fn(),
  getSubjectTotals: vi.fn(),
  getAllKanjiSubjects: vi.fn(),
  getAllRadicalAndVocabularySubjects: vi.fn()
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
  api.getLevelAssignments.mockResolvedValue([])
  api.getLevelProgressions.mockResolvedValue([])
  api.getSpacedRepetitionSystems.mockResolvedValue([])
  api.getSubjects.mockResolvedValue([])
  api.getSubjectTotals.mockResolvedValue({ radical: 10, kanji: 20, vocabulary: 30 })
  api.getLevelRadicals.mockResolvedValue([[], []])
  api.getLevelVocabulary.mockResolvedValue([[], []])
  api.getAllKanjiSubjects.mockResolvedValue([])
  api.getAllRadicalAndVocabularySubjects.mockRejectedValue(new Error('not in this test'))
}

// Wait for something drawn by a later phase — coverage waits on a lazily
// loaded module as well as its reads.
async function until(host, selector) {
  for (let i = 0; i < 50 && !host.querySelector(selector); i++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
  }
  return host.querySelector(selector)
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

const readout = host => host.querySelector('.level .readout').textContent

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

  it('leaves the kanji to the next level and the seven days out of the figures', async () => {
    const host = await board()
    const figures = host.querySelector('.figures').textContent
    expect(figures).not.toContain('to level')
    expect(figures).not.toContain('7 days')
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
  const decadeDates = host => [...host.querySelectorAll('.dial .decades .when')].map(w => w.textContent)

  it('starts at the median, and says so', async () => {
    history()
    const host = await board()
    expect(host.querySelector('#pace-dial').value).toBe('10')
    expect(readings(host)).toContain('10days a level')
    expect(host.querySelector('.dial .readings').textContent).toContain('Your median pace')
  })

  it('moves level 60 and the road with it, and says by how much', async () => {
    history()
    const host = await board()
    const before = [readings(host), decadeDates(host)]
    await slide(host, 7)
    expect(readings(host)).toContain('7days a level')
    expect(readings(host)).not.toBe(before[0])
    expect(decadeDates(host)).not.toEqual(before[1])
    expect(host.querySelector('.dial .readings').textContent).toMatch(/\d+ weeks sooner than at your median/)
    expect(host.querySelector('.dial .head').textContent).toContain('7 days a level')
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

  it('remembers a goal of a level by a month, and says the pace it asks for', async () => {
    history()
    const host = await board()
    const pick = async (id, value) => {
      const select = host.querySelector(`#${id}`)
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      set.call(select, String(value))
      await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })))
    }
    await pick('goal-level', 20)
    const stored = JSON.parse(localStorage.getItem('kanigami-goal'))
    expect(stored.level).toBe(20)
    // the first pick starts at the month the dial's pace gets there, so it does
    expect(host.querySelector('.dial').textContent).toContain('the dial’s pace gets there')
    expect(host.querySelector('.dial .goal-line')).toBeTruthy()

    // Level 60 by the end of this month: 55 levels in a few weeks, which no
    // pace reaches, even the 1-day floor used when the SRS table is missing.
    await pick('goal-level', 60)
    await pick('goal-year', new Date().getFullYear())
    await pick('goal-month', new Date().getMonth())
    expect(host.querySelector('.dial').textContent).toContain('sooner than WaniKani’s intervals allow')

    await pick('goal-level', '')
    expect(localStorage.getItem('kanigami-goal')).toBeNull()
    expect(host.querySelector('.dial .goal-line')).toBeNull()
  })

  it('reads a remembered goal back on the next visit', async () => {
    history()
    localStorage.setItem('kanigami-goal', JSON.stringify({ level: 40, year: new Date().getFullYear() + 3, month: 0 }))
    const host = await board()
    expect(host.querySelector('#goal-level').value).toBe('40')
    expect(host.querySelector('.dial').textContent).toMatch(/To reach level 40 by Jan \d{4}: [\d.]+ days a level/)
  })

  it('stays away until a level has passed', async () => {
    const host = await board()
    expect(host.querySelector('#pace-dial')).toBeNull()
  })
})

describe('the decades on the dial', () => {
  it('marks where each of the six begins', async () => {
    const now = Date.now()
    api.getLevelProgressions.mockResolvedValue([
      { data: { level: 1, unlocked_at: new Date(now - 20 * 86400000).toISOString(), passed_at: new Date(now - 10 * 86400000).toISOString(), abandoned_at: null } },
      { data: { level: 2, unlocked_at: new Date(now - 10 * 86400000).toISOString(), passed_at: null, abandoned_at: null } }
    ])
    const host = await board({ user: { ...USER, level: 2 } })
    const marks = host.querySelector('.dial .decades').textContent
    for (const name of ['pleasant', 'painful', 'death', 'hell', 'paradise', 'reality']) expect(marks).toContain(name)
    // Level 1 runs the accelerated system, so it is never called yours.
    expect(host.querySelector('.notes.flags')).toBeNull()
  })

  it('names your fastest level from the ones after the accelerated two', async () => {
    const day = 86400000
    const now = Date.now()
    const lengths = [3, 4, 9, 7, 12]
    let t = now - 40 * day
    api.getLevelProgressions.mockResolvedValue([
      ...lengths.map((d, i) => {
        const record = { data: { level: i + 1, unlocked_at: new Date(t).toISOString(), passed_at: new Date(t + d * day).toISOString(), abandoned_at: null } }
        t += d * day
        return record
      }),
      { data: { level: 6, unlocked_at: new Date(t).toISOString(), passed_at: null, abandoned_at: null } }
    ])
    const host = await board({ user: { ...USER, level: 6 } })
    expect(host.querySelector('.notes.flags').textContent).toContain('Your fastest · level 4, 7 days')
    expect(host.querySelectorAll('.dial .bars .fastest')).toHaveLength(1)
  })
})

describe('upcoming burns', () => {
  it('counts enlightened items whose next review is the burn, this week', async () => {
    const soon = new Date(Date.now() + 2 * HOUR).toISOString()
    api.getStartedAssignments.mockResolvedValue([
      { data: { subject_id: 900, subject_type: 'vocabulary', srs_stage: 8, started_at: soon, available_at: soon } },
      { data: { subject_id: 901, subject_type: 'vocabulary', srs_stage: 8, started_at: soon, available_at: soon } },
      { data: { subject_id: 902, subject_type: 'vocabulary', srs_stage: 7, started_at: soon, available_at: soon } }
    ])
    api.getSubjectTotals.mockResolvedValue({ radical: 500, kanji: 2000, vocabulary: 6000 })
    const host = await board()
    const line = (await until(host, '.burnline')).textContent
    expect(line).toMatch(/^2 up for burning this week · \d+ today$/)
  })
})

describe('keeps slipping', () => {
  const stat = (subject_id, percentage) => ({
    data: { subject_id, subject_type: 'kanji', percentage_correct: percentage, meaning_incorrect: 4 }
  })

  beforeEach(() => {
    api.getReviewStatistics.mockResolvedValue([stat(700, 40), stat(1, 60)])
    api.getLevelAssignments.mockResolvedValue([{ data: { subject_id: 1 } }])
    api.getSubjects.mockResolvedValue([subject(700, '届', 'Deliver'), subject(1, '山', 'Mountain')])
  })

  const shown = host => [...host.querySelectorAll('.slipping .character')].map(c => c.textContent)

  it('switches between every level and this one, reading the subjects once', async () => {
    const host = await board()
    await until(host, '.slipping')
    expect(shown(host)).toEqual(['届', '山'])
    await click(button(host, 'level 5'))
    expect(shown(host)).toEqual(['山'])
    await click(button(host, 'all levels'))
    expect(shown(host)).toEqual(['届', '山'])
    expect(api.getSubjects).toHaveBeenCalledOnce()
  })

  it('links each character out to its WaniKani page, and names the half it is missed on', async () => {
    api.getReviewStatistics.mockResolvedValue([
      { data: { subject_id: 700, subject_type: 'kanji', percentage_correct: 40,
        meaning_correct: 9, meaning_incorrect: 1, reading_correct: 3, reading_incorrect: 7 } }
    ])
    const page = 'https://www.wanikani.com/kanji/%E5%B1%8A'
    api.getSubjects.mockResolvedValue([{ ...subject(700, '届', 'Deliver'), data: { ...subject(700, '届', 'Deliver').data, document_url: page } }])
    const host = await board()
    await until(host, '.slipping')
    const link = host.querySelector('.slipping a.character')
    expect(link.getAttribute('href')).toBe(page)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(host.querySelector('.slipping .weak').textContent).toBe('r reading 30%, ')
  })

  it('reads a row in full by hover, and by a tap that holds', async () => {
    api.getReviewStatistics.mockResolvedValue([
      { data: { subject_id: 700, subject_type: 'kanji', percentage_correct: 40,
        meaning_correct: 9, meaning_incorrect: 1, reading_correct: 3, reading_incorrect: 7 } }
    ])
    const deliver = subject(700, '届', 'Deliver')
    api.getSubjects.mockResolvedValue([{ ...deliver, data: { ...deliver.data, readings: [{ reading: 'とど', primary: true }] } }])
    const host = await board()
    await until(host, '.slipping')
    const readout = () => host.querySelector('.slipping + .readout').textContent
    const row = host.querySelector('.slipping .meaning')
    expect(readout()).toContain('for how it is missed')
    await hover(row)
    expect(readout()).toContain('届 Deliver, とど · missed 8 times · meaning 90%, reading 30% right')
    await unhover(row)
    expect(readout()).not.toContain('missed 8 times')
    await tap(row)
    expect(readout()).toContain('missed 8 times')
  })

  it('looks at the same slips by lens, reading the look-alikes only when that lens opens', async () => {
    api.getReviewStatistics.mockResolvedValue([
      { data: { subject_id: 700, subject_type: 'kanji', percentage_correct: 40, meaning_correct: 3, meaning_incorrect: 5,
        meaning_current_streak: 1, meaning_max_streak: 5 } },
      { data: { subject_id: 701, subject_type: 'kanji', percentage_correct: 88, meaning_correct: 8, meaning_incorrect: 1 } }
    ])
    const end = subject(700, '末', 'End')
    api.getSubjects
      .mockResolvedValueOnce([{ ...end, data: { ...end.data, visually_similar_subject_ids: [701] } }])
      .mockResolvedValueOnce([subject(701, '未', 'Not Yet')])
    const host = await board()
    await until(host, '.slipping')
    expect(api.getSubjects).toHaveBeenCalledOnce()

    await click(button(host, 'how'))
    expect(host.querySelector('.slipping li.group').textContent).toBe('fell back1')

    await click(button(host, 'alike'))
    await until(host, '.pair')
    expect(api.getSubjects).toHaveBeenLastCalledWith(expect.anything(), [701])
    expect(host.querySelector('.pair').textContent).toContain('未 sticks; 末 is the one to fix')

    await click(button(host, 'worst'))
    await click(button(host, 'alike'))
    expect(api.getSubjects).toHaveBeenCalledTimes(2)
  })

  it('has no switch when the level’s assignments do not load', async () => {
    api.getLevelAssignments.mockRejectedValue(new Error('Load failed'))
    const host = await board()
    await until(host, '.slipping')
    expect(button(host, 'level 5')).toBeUndefined()
    expect(shown(host)).toEqual(['届', '山'])
  })
})

describe('milestones', () => {
  it('shows the next round number with how many to go, and the ones reached', async () => {
    const day = 86400000
    api.getStartedAssignments.mockResolvedValue(
      Array.from({ length: 120 }, (_, i) => ({
        data: { subject_id: 500 + i, subject_type: 'kanji', srs_stage: 5, started_at: new Date(Date.now() - (120 - i) * day).toISOString() }
      }))
    )
    api.getSubjectTotals.mockResolvedValue({ radical: 500, kanji: 2000, vocabulary: 6000 })
    const host = await board()
    const ladder = (await until(host, '.ladder')).textContent
    expect(ladder).toContain('250 kanji')
    expect(ladder).toContain('130 to go')
    expect(ladder).toContain('100 kanji')
  })
})

describe('coverage', () => {
  const kanji = (id, level, characters) => ({ id, data: { level, characters } })

  beforeEach(() => {
    // 山 and 川 at level 5, 一 at level 20; only 山 taught. All three are N5.
    api.getAllKanjiSubjects.mockResolvedValue([kanji(1, 5, '山'), kanji(2, 5, '川'), kanji(3, 20, '一')])
    api.getStartedAssignments.mockResolvedValue([{ data: { subject_id: 1, subject_type: 'kanji', srs_stage: 3, started_at: new Date().toISOString() } }])
  })

  const n5 = host => host.querySelector('.cover .row .pct').textContent

  it('counts what has been taught against the list', async () => {
    const host = await board()
    await until(host, '.cover')
    expect(n5(host)).toMatch(/1 of 79/)
  })

  const through = async (host, level) => {
    const input = host.querySelector('#through-level')
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(input, String(level))
    await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
  }

  it('shows the gain through a later level when the slider moves', async () => {
    const host = await board()
    await until(host, '.cover')
    await through(host, 20)
    expect(n5(host)).toMatch(/^\+2 \d+% 3 of 79$/)
    expect(host.querySelector('.forward .through').textContent).toContain('Through level 20')
  })

  it('moves only taught’s kanji line when the radicals and words ahead could not be read', async () => {
    const host = await board()
    await until(host, '.cover')
    await through(host, 20)
    const fills = host.querySelector('.fills').textContent
    expect(fills).toContain('+2 3 kanji')
    expect(host.querySelectorAll('.fills .still')).toHaveLength(2)
    expect(host.querySelector('.forward .through').textContent).toContain('radicals and vocabulary stay')
  })

  it('moves every taught line once the radicals and words ahead are read', async () => {
    // A radical at level 10 and two words at levels 12 and 30, none started.
    api.getAllRadicalAndVocabularySubjects.mockResolvedValue([
      { id: 40, object: 'radical', data: { level: 10 } },
      { id: 41, object: 'vocabulary', data: { level: 12 } },
      { id: 42, object: 'kana_vocabulary', data: { level: 30 } }
    ])
    const host = await board()
    await until(host, '.cover')
    await settle()
    await through(host, 20)
    const fills = host.querySelector('.fills').textContent
    expect(fills).toContain('+1 1 radicals')
    expect(fills).toContain('+1 1 vocabulary')
    expect(host.querySelectorAll('.fills .still')).toHaveLength(0)
  })

  it('switches to the Jōyō grades', async () => {
    const host = await board()
    await until(host, '.cover')
    await click(button(host, 'Jōyō'))
    expect(host.querySelector('.cover .row .name').textContent).toBe('grade 1')
  })

  it('stays away when the kanji could not be read', async () => {
    api.getAllKanjiSubjects.mockRejectedValue(new Error('no'))
    const host = await board()
    await settle()
    expect(host.querySelector('.cover')).toBeNull()
    expect(host.querySelector('.figures')).toBeTruthy()
  })
})

describe('the level line', () => {
  const line = host => host.querySelector('.level-line').textContent

  it('says how many kanji to the next level, and how many are still locked', async () => {
    const host = await board()
    expect(line(host)).toContain('2 kanji to level 6, 1 of the level’s still locked')
    expect(line(host)).toContain('0 of 2 needed')
    expect(host.querySelectorAll('.level-line .states i')).toHaveLength(2)
    expect(host.querySelector('.level-line .tally').textContent).toBe('1 apprentice1 locked')
  })

  it('says what is up next, and what the locked kanji wait on', async () => {
    api.getLevelRadicals.mockResolvedValue([
      [{ id: 31, data: { characters: '工', meanings: [{ meaning: 'Construction', primary: true }], lesson_position: 0 } }],
      [{ data: { subject_id: 31, srs_stage: 3, started_at: new Date().toISOString() } }]
    ])
    const host = await board()
    await settle()
    expect(line(host)).toContain('山 up at')
    expect(line(host)).toContain('Waits on 1 locked kanji · 1 of the level’s radicals not passed yet')
  })

  it('says which radical holds which locked kanji', async () => {
    api.getLevelKanjiSubjects.mockResolvedValue([
      subject(1, '山', 'Mountain'),
      { id: 2, data: { characters: '川', meanings: [{ meaning: 'River', primary: true }], lesson_position: 2, component_subject_ids: [31] } }
    ])
    api.getLevelRadicals.mockResolvedValue([
      [{ id: 31, data: { characters: '工', meanings: [{ meaning: 'Construction', primary: true }], lesson_position: 0 } }],
      [{ data: { subject_id: 31, srs_stage: 3, started_at: new Date().toISOString() } }]
    ])
    const host = await board()
    await settle()
    const row = host.querySelector('.level-line .behind li').textContent
    expect(row).toContain('工')
    expect(row).toContain('Construction')
    expect(row).toContain('apprentice III')
    expect(row).toContain('holds 川')
  })

  it('hands its radicals to the grid’s switch, so they are read once', async () => {
    const host = await board()
    await settle()
    await click(button(host, 'radicals'))
    expect(api.getLevelRadicals).toHaveBeenCalledOnce()
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

  it('switches the grid to the level’s radicals from the head, reading them once', async () => {
    api.getLevelRadicals.mockResolvedValue([
      [{ id: 31, data: { characters: '工', meanings: [{ meaning: 'Construction', primary: true }], lesson_position: 0 } }],
      [{ data: { subject_id: 31, srs_stage: 5, started_at: new Date().toISOString(), passed_at: new Date().toISOString() } }]
    ])
    const host = await board()
    await click(button(host, 'radicals'))
    await settle()
    expect(host.querySelector('.level .kanji').textContent).toContain('工')
    expect(host.querySelector('.level .readout').textContent).toContain('1 of 1 passed')
    await click(button(host, 'kanji'))
    expect(host.querySelector('.level .kanji').textContent).toContain('山')
    await click(button(host, 'radicals'))
    expect(api.getLevelRadicals).toHaveBeenCalledOnce()
  })

  it('switches the grid to the level’s vocabulary, flowing words, reading them once', async () => {
    api.getLevelVocabulary.mockResolvedValue([
      [
        { id: 41, data: { characters: '山道', meanings: [{ meaning: 'Mountain Road', primary: true }], lesson_position: 0 } },
        { id: 42, data: { characters: 'すごい', meanings: [{ meaning: 'Amazing', primary: true }], lesson_position: 1 } }
      ],
      [{ data: { subject_id: 41, srs_stage: 5, started_at: new Date().toISOString(), passed_at: new Date().toISOString() } }]
    ])
    const host = await board()
    await click(button(host, 'vocab'))
    await settle()
    const words = host.querySelector('.level .kanji.words')
    expect(words.textContent).toContain('山道')
    expect(words.textContent).toContain('すごい')
    expect(host.querySelector('.level .readout').textContent).toContain('1 of 2 passed')
    expect(host.querySelector('.level .readout').textContent).toContain('a word')
    await click(button(host, 'kanji'))
    expect(host.querySelector('.level .kanji.words')).toBeNull()
    await click(button(host, 'vocab'))
    expect(api.getLevelVocabulary).toHaveBeenCalledOnce()
  })

  it('offers to try the vocabulary again when it fails to load', async () => {
    api.getLevelVocabulary.mockRejectedValueOnce(new TypeError('Load failed'))
    const host = await board()
    await click(button(host, 'vocab'))
    await settle()
    expect(host.querySelector('.level [role="alert"]').textContent).toContain('The vocabulary did not load')
    await click(button(host, 'Try again'))
    await settle()
    expect(api.getLevelVocabulary).toHaveBeenCalledTimes(2)
    expect(host.querySelector('.level [role="alert"]')).toBeNull()
  })

  it('opens a kanji’s WaniKani page on a second tap, never the first', async () => {
    const page = 'https://www.wanikani.com/kanji/%E5%B1%B1'
    const mountain = subject(1, '山', 'Mountain')
    api.getLevelKanjiSubjects.mockResolvedValue([{ ...mountain, data: { ...mountain.data, document_url: page } }])
    const host = await board()
    const link = cell(host, 0).querySelector('a')
    expect(link.getAttribute('href')).toBe(page)
    // Whether the board let the click through, read after React has had
    // it — and then stopped, since jsdom cannot open a tab.
    const opened = []
    const record = event => {
      opened.push(!event.defaultPrevented)
      event.preventDefault()
    }
    document.addEventListener('click', record)
    const press = () => act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await tap(link)
    await press()
    expect(readout(host)).toContain('山 Mountain')
    await tap(link)
    await press()
    document.removeEventListener('click', record)
    expect(opened).toEqual([false, true])
  })

  it('carries each cell’s words for a screen reader', async () => {
    const host = await board()
    expect(cell(host, 1).querySelector('.sr-only').textContent).toBe('川 River: locked, Not unlocked yet')
  })
})

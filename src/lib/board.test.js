import { describe, expect, it } from 'vitest'
import {
  MIN_MISSES,
  accuracy,
  burnsAhead,
  earliestLevelUp,
  leeches,
  levelKanji,
  levelUpKanji,
  milestones,
  moved,
  nextUp,
  fastestLevel,
  pace,
  paceToReach,
  project,
  road,
  srsSystems,
  week
} from './board.js'

// Hand-authored, smallest-possible shapes. Fake ids and dates throughout.
const NOW = new Date(2026, 0, 14, 19, 40) // local time, a Wednesday evening
const local = (day, hour) => new Date(2026, 0, day, hour).toISOString()

const assignment = (data) => ({ data: { subject_id: 1, srs_stage: 3, ...data } })
const stat = (data) => ({ data: { subject_id: 1, subject_type: 'kanji', ...data } })

describe('week', () => {
  it('counts the backlog into today and each later review into its own day', () => {
    const days = week(
      [
        assignment({ available_at: local(10, 8) }), // long overdue — today
        assignment({ available_at: local(14, 23) }), // tonight
        assignment({ available_at: local(15, 0) }), // just past midnight — tomorrow
        assignment({ available_at: local(20, 12) }), // the seventh day
        assignment({ available_at: local(21, 9) }) // past the window
      ],
      NOW
    )
    expect(days.map(d => d.count)).toEqual([2, 1, 0, 0, 0, 0, 1])
    expect(days[0].day.getDate()).toBe(14)
    expect(days[6].day.getDate()).toBe(20)
  })

  it('leaves burned items and items with no review time out', () => {
    const days = week(
      [assignment({ srs_stage: 9, available_at: null }), assignment({ available_at: null })],
      NOW
    )
    expect(days.every(d => d.count === 0)).toBe(true)
  })
})

describe('accuracy', () => {
  it('sums answers rather than averaging subjects', () => {
    const a = accuracy([
      stat({ meaning_correct: 99, meaning_incorrect: 1, reading_correct: 8, reading_incorrect: 2 }),
      stat({ meaning_correct: 0, meaning_incorrect: 1, reading_correct: 0, reading_incorrect: 0 })
    ])
    expect(a.meaning).toBeCloseTo(99 / 101)
    expect(a.reading).toBeCloseTo(0.8)
  })

  it('is null for a side nobody has answered, never 100%', () => {
    expect(accuracy([])).toEqual({ meaning: null, reading: null })
    expect(accuracy([stat({ meaning_correct: 3, meaning_incorrect: 0 })]).reading).toBeNull()
  })
})

describe('leeches', () => {
  const slipping = (id, percentage, misses, type = 'kanji') =>
    stat({ subject_id: id, subject_type: type, percentage_correct: percentage, meaning_incorrect: misses })

  it('ranks the lowest accuracy first, ties to the most missed', () => {
    const found = leeches([slipping(1, 70, 4), slipping(2, 58, 5), slipping(3, 70, 9)], [])
    expect(found.map(l => l.subjectId)).toEqual([2, 3, 1])
  })

  it('skips burned items and items missed too few times to mean anything', () => {
    const found = leeches(
      [slipping(1, 40, 6), slipping(2, 10, MIN_MISSES - 1), slipping(3, 60, 3)],
      [assignment({ subject_id: 1, srs_stage: 9 })]
    )
    expect(found.map(l => l.subjectId)).toEqual([3])
  })

  it('narrows to the subjects it is given, when it is given some', () => {
    const found = leeches([slipping(1, 40, 6), slipping(2, 50, 4), slipping(3, 60, 3)], [], 5, new Set([2, 3]))
    expect(found.map(l => l.subjectId)).toEqual([2, 3])
  })

  it('names the half it is missed on, and nothing for a radical or a tie', () => {
    const half = (subject_id, extra) => stat({ subject_id, subject_type: 'kanji', percentage_correct: 50, ...extra })
    const found = leeches([
      half(1, { meaning_correct: 9, meaning_incorrect: 1, reading_correct: 3, reading_incorrect: 7 }),
      half(2, { meaning_correct: 2, meaning_incorrect: 6, reading_correct: 9, reading_incorrect: 1 }),
      half(3, { meaning_correct: 5, meaning_incorrect: 5 }),
      half(4, { meaning_correct: 5, meaning_incorrect: 5, reading_correct: 5, reading_incorrect: 5 })
    ])
    expect(Object.fromEntries(found.map(l => [l.subjectId, l.weak]))).toEqual({
      1: { half: 'reading', percentage: 30 },
      2: { half: 'meaning', percentage: 25 },
      3: null,
      4: null
    })
  })

  it('names kana vocabulary as vocabulary', () => {
    expect(leeches([slipping(4, 50, 4, 'kana_vocabulary')], [])[0].type).toBe('vocabulary')
  })
})

describe('moved', () => {
  it('counts lessons started, first passes and burns inside the window only', () => {
    const m = moved(
      [
        assignment({ started_at: local(13, 20) }),
        assignment({ started_at: local(1, 20), passed_at: local(12, 9) }),
        assignment({ passed_at: local(2, 9) }),
        assignment({ burned_at: local(14, 7) })
      ],
      NOW
    )
    expect(m).toEqual({ apprentice: 1, guru: 1, burned: 1 })
  })
})

describe('pace', () => {
  const prog = (level, unlocked, passed, extra = {}) => ({
    data: { level, unlocked_at: local(unlocked, 0), passed_at: passed ? local(passed, 0) : null, abandoned_at: null, ...extra }
  })

  it('times each passed level and takes the median', () => {
    const p = pace([prog(1, 1, 5), prog(2, 5, 11), prog(3, 11, 13)], 3, NOW)
    expect(p.levels.map(l => Math.round(l.days))).toEqual([4, 6])
    expect(p.levels.some(l => l.break)).toBe(false)
    expect(p.median).toBe(5)
    expect(p.current.days).toBeCloseTo(3.82, 1)
  })

  it('takes the recent pace from the last five levels that were not breaks', () => {
    // levels of 10, 10, 10, then five of 2 days
    const ends = [0, 10, 20, 30, 32, 34, 36, 38, 40]
    const p = pace(
      ends.slice(1).map((end, i) => ({
        data: { level: i + 1, unlocked_at: new Date(2025, 0, 1 + ends[i]).toISOString(), passed_at: new Date(2025, 0, 1 + end).toISOString(), abandoned_at: null }
      })),
      9,
      NOW
    )
    expect(p.median).toBeCloseTo(2, 5)
    expect(p.recent).toBeCloseTo(2, 5)
  })

  it('marks a level over three times the median as a break and leaves it out', () => {
    // three 2-day levels, then one that sat for 20 days
    const days = [0, 2, 4, 6, 26]
    const p = pace(
      days.slice(1).map((end, i) => ({
        data: { level: i + 1, unlocked_at: new Date(2025, 0, 1 + days[i]).toISOString(), passed_at: new Date(2025, 0, 1 + end).toISOString(), abandoned_at: null }
      })),
      5,
      NOW
    )
    expect(p.levels.map(l => l.break)).toEqual([false, false, false, true])
    expect(p.median).toBeCloseTo(2, 5)
  })

  it('drops abandoned records and keeps the later of a level reached twice', () => {
    const p = pace(
      [prog(1, 1, 3, { abandoned_at: local(4, 0) }), prog(1, 4, 10), prog(2, 10, null)],
      2,
      NOW
    )
    expect(p.levels).toHaveLength(1)
    expect(Math.round(p.levels[0].days)).toBe(6)
  })

  it('has no pace before a level has passed', () => {
    const p = pace([prog(1, 1, null)], 1, NOW)
    expect(p.median).toBeNull()
    expect(p.recent).toBeNull()
  })
})

describe('project', () => {
  const DAY = 86400000
  const days = d => (d - NOW) / DAY
  const p = { current: { level: 15, days: 13 } }

  it('finishes this level at the pace, then one level per pace', () => {
    const at = project(p, 15, 15, NOW)
    expect(days(at.startOf(16))).toBeCloseTo(2, 5)
    expect(days(at.startOf(60))).toBeCloseTo(2 + 44 * 15, 5)
    expect(days(at.done)).toBeCloseTo(2 + 45 * 15, 5)
  })

  it('ends a level already longer than the pace now', () => {
    expect(days(project(p, 15, 7, NOW).startOf(16))).toBeCloseTo(0, 5)
  })

  it('never ends this level before the earliest level-up', () => {
    const soonest = new Date(NOW.getTime() + 3.5 * DAY)
    const at = project(p, 15, 7, NOW, soonest)
    expect(at.startOf(16).getTime()).toBe(soonest.getTime())
    expect(days(at.startOf(17))).toBeCloseTo(3.5 + 7, 5)
  })

  it('has no start for a level already reached, and no projection without a pace', () => {
    expect(project(p, 15, 15, NOW).startOf(15)).toBeNull()
    expect(project(p, 15, null, NOW)).toBeNull()
  })

  it('at 60, says only when 60 is done', () => {
    const at = project({ current: { level: 60, days: 4 } }, 60, 10, NOW)
    expect(at.startOf(60)).toBeNull()
    expect(days(at.done)).toBeCloseTo(6, 5)
  })
})

describe('levelKanji and nextUp', () => {
  const subject = (id, characters, position) => ({
    id,
    data: { characters, lesson_position: position, meanings: [{ meaning: `m${id}`, primary: true }] }
  })
  const subjects = [subject(3, '血', 2), subject(1, '山', 0), subject(2, '川', 1), subject(4, '森', 3), subject(5, '林', 4)]
  const assignments = [
    assignment({ subject_id: 1, srs_stage: 5, passed_at: local(10, 0), started_at: local(1, 0) }),
    assignment({ subject_id: 2, srs_stage: 4, started_at: local(8, 0), available_at: local(14, 21) }),
    assignment({ subject_id: 3, srs_stage: 2, started_at: local(12, 0), available_at: local(14, 21) }),
    assignment({ subject_id: 4, srs_stage: 0, started_at: null })
  ]

  it('orders by progress, furthest first, and says where each stands', () => {
    const k = levelKanji(subjects, assignments)
    expect(k.map(x => `${x.characters}:${x.state}`)).toEqual([
      '山:passed',
      '川:apprentice',
      '血:apprentice',
      '森:lesson',
      '林:locked'
    ])
    expect(k[0].meaning).toBe('m1')
  })

  it('puts a higher stage first whatever the lesson order, and keeps lesson order where no review is set', () => {
    const k = levelKanji(
      [subject(1, 'A', 0), subject(2, 'B', 1), subject(3, 'C', 2), subject(4, 'D', 3), subject(5, 'E', 4)],
      [
        assignment({ subject_id: 1, srs_stage: 1, started_at: local(12, 0) }),
        assignment({ subject_id: 2, srs_stage: 3, started_at: local(8, 0) }),
        assignment({ subject_id: 3, srs_stage: 6, started_at: local(1, 0), passed_at: local(10, 0) }),
        assignment({ subject_id: 5, srs_stage: 3, started_at: local(8, 0) })
      ]
    )
    expect(k.map(x => x.characters).join('')).toBe('CBEAD')
  })

  it('puts the one up next first within a stage', () => {
    const k = levelKanji(
      [subject(1, 'A', 0), subject(2, 'B', 1), subject(3, 'C', 2), subject(4, 'D', 3)],
      [
        assignment({ subject_id: 1, srs_stage: 3, started_at: local(8, 0), available_at: local(16, 9) }),
        assignment({ subject_id: 2, srs_stage: 3, started_at: local(8, 0), available_at: local(15, 2) }),
        assignment({ subject_id: 3, srs_stage: 5, started_at: local(1, 0), passed_at: local(9, 0), available_at: local(20, 0) }),
        assignment({ subject_id: 4, srs_stage: 5, started_at: local(1, 0), passed_at: local(9, 0), available_at: local(17, 0) })
      ]
    )
    // guru I first, the sooner of the two leading; then apprentice III, sooner first
    expect(k.map(x => x.characters).join('')).toBe('DCBA')
  })

  it('carries WaniKani\'s image for a radical with no character', () => {
    const radical = {
      id: 9,
      data: {
        characters: null,
        lesson_position: 0,
        meanings: [{ meaning: 'stick', primary: true }],
        character_images: [{ url: 'https://example.test/a.svg', content_type: 'image/svg+xml' }]
      }
    }
    const [r] = levelKanji([radical], [])
    expect(r.image).toBe('https://example.test/a.svg')
    expect(r.state).toBe('locked')
  })

  it('groups what comes up soonest and says whether each is one step from passing', () => {
    const up = nextUp(levelKanji(subjects, assignments), NOW)
    expect(up.kanji.map(x => x.characters)).toEqual(['川', '血'])
    expect(up.at).toBe(local(14, 21))
    expect(up.oneStep).toBe(false)
  })

  it('treats everything already due as one group due now', () => {
    const due = [
      assignment({ subject_id: 2, srs_stage: 4, started_at: local(8, 0), available_at: local(13, 9) }),
      assignment({ subject_id: 3, srs_stage: 4, started_at: local(8, 0), available_at: local(14, 11) })
    ]
    const up = nextUp(levelKanji(subjects, due), NOW)
    expect(up.at).toBeNull()
    expect(up.kanji).toHaveLength(2)
    expect(up.oneStep).toBe(true)
  })
})

describe('earliestLevelUp', () => {
  // WaniKani's two systems as /spaced_repetition_systems serves them, in
  // seconds: 4h 8h 23h 47h to guru, and the accelerated 2h 4h 8h 23h.
  const system = (id, waits) => ({
    id,
    data: {
      passing_stage_position: 5,
      stages: [null, ...waits, 601200, 1206000, 2588400, 10364400, null].map((interval, position) => ({
        position,
        interval,
        interval_unit: 'seconds'
      }))
    }
  })
  const systems = srsSystems([system(1, [14400, 28800, 82800, 169200]), system(2, [7200, 14400, 28800, 82800])])
  const H = 3600000
  const at = hoursFromNow => new Date(NOW.getTime() + hoursFromNow * H)
  const kanji = (state, stage, availableAt, sys = 1) => ({ state, stage, availableAt: availableAt?.toISOString() ?? null, system: sys })

  it('reads the waits off the system in milliseconds', () => {
    expect(systems.get(1).waits.slice(1, 5)).toEqual([4, 8, 23, 47].map(h => h * H))
    expect(systems.get(1).passing).toBe(5)
  })

  it('passes an apprentice IV item at its next review', () => {
    const up = earliestLevelUp([kanji('apprentice', 4, at(2))], systems, 1, NOW)
    expect(up.at.getTime()).toBe(at(2).getTime())
  })

  it('walks the remaining stages, rounding each review down to the hour', () => {
    // stage 3, up in 2h: right → IV, back 47h later on the hour → guru
    const up = earliestLevelUp([kanji('apprentice', 3, at(2))], systems, 1, NOW)
    const expected = Math.floor((at(2).getTime() + 47 * H) / H) * H
    expect(up.at.getTime()).toBe(expected)
  })

  it('starts an item still in lessons now, and uses the accelerated system where it applies', () => {
    const normal = earliestLevelUp([kanji('lesson', 0, null, 1)], systems, 1, NOW)
    const fast = earliestLevelUp([kanji('lesson', 0, null, 2)], systems, 1, NOW)
    expect(fast.at < normal.at).toBe(true)
  })

  it('is the moment the remaining-th soonest kanji passes', () => {
    const up = earliestLevelUp(
      [kanji('apprentice', 4, at(30)), kanji('apprentice', 4, at(1)), kanji('apprentice', 4, at(9))],
      systems,
      2,
      NOW
    )
    expect(up.at.getTime()).toBe(at(9).getTime())
  })

  it('has no time when the level-up waits on locked kanji', () => {
    const up = earliestLevelUp([kanji('apprentice', 4, at(1)), kanji('locked', null, null)], systems, 2, NOW)
    expect(up).toEqual({ at: null, waitsOnLocked: true })
  })

  it('has nothing to project once the threshold is met', () => {
    expect(earliestLevelUp([], systems, 0, NOW)).toBeNull()
  })

  it('names the kanji the level-up waits on, soonest to pass first', () => {
    const fast = { ...kanji('apprentice', 4, at(1)), characters: 'A' }
    const slow = { ...kanji('apprentice', 1, at(1)), characters: 'B' }
    const mid = { ...kanji('apprentice', 4, at(20)), characters: 'C' }
    const locked = { ...kanji('locked', null, null), characters: 'D' }
    const passed = { ...kanji('passed', 5, at(1)), characters: 'E' }
    expect(levelUpKanji([slow, locked, mid, passed, fast], systems, 2, NOW).map(k => k.characters)).toEqual(['A', 'C'])
    expect(levelUpKanji([fast], systems, 0, NOW)).toEqual([])
  })

  it('reads the fastest level off the table: two runs to guru', () => {
    // (4 + 8 + 23 + 47) hours, twice
    expect(fastestLevel(systems.get(1)) * 24).toBeCloseTo(164, 5)
    expect(fastestLevel(systems.get(2)) < fastestLevel(systems.get(1))).toBe(true)
    expect(fastestLevel(undefined)).toBeNull()
  })
})

describe('road', () => {
  const at = d => new Date(2026, 0, d).toISOString()
  // levels 1–10 passed at 2 days each from 1 jan; level 11 unlocked on the 21st
  const p = {
    levels: Array.from({ length: 10 }, (_, i) => ({ level: i + 1, days: 2, unlockedAt: at(1 + i * 2), break: false })),
    current: { level: 11, days: 3, unlockedAt: at(21) },
    median: 2
  }

  it('names the six decades in order, with where you stand in each', () => {
    const r = road(p, 11, NOW)
    expect(r.map(d => d.kanji)).toEqual(['快', '苦', '死', '地獄', '天国', '現実'])
    expect(r.map(d => d.state)).toEqual(['done', 'current', 'ahead', 'ahead', 'ahead', 'ahead'])
    expect([r[3].first, r[3].last]).toEqual([31, 40])
  })

  it('dates a reached decade by its first unlock', () => {
    const r = road(p, 11, NOW)
    expect(r[0].at.toISOString()).toBe(at(1))
    expect(r[1].at.toISOString()).toBe(at(21))
  })

  it('projects a decade ahead at the median, from what is left of this level', () => {
    const r = road(p, 11, NOW)
    // this level is already past the median, so nothing is left of it; then
    // levels 12–20 at two days each before 21 unlocks
    expect((r[2].at - NOW) / 86400000).toBeCloseTo(9 * 2, 5)
  })

  it('projects at the pace it is given rather than the median', () => {
    const r = road(p, 11, NOW, 5)
    // level 11 is three days in, so two are left at five a level; then
    // levels 12–20 at five each
    expect((r[2].at - NOW) / 86400000).toBeCloseTo(2 + 9 * 5, 5)
  })

  it('has no dates it cannot know', () => {
    const r = road({ levels: [], current: null, median: null }, 1, NOW)
    expect(r[0].at).toBeNull()
    expect(r[1].at).toBeNull()
  })
})

describe('milestones', () => {
  const DAY = 86400000
  const ago = days => new Date(NOW.getTime() - days * DAY).toISOString()
  // n items of a type, one started each day, the newest `newest` days ago
  const run = (n, type, newest = 0, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ data: { subject_type: type, started_at: ago(newest + n - 1 - i), ...extra } }))

  it('dates a reached step by the start of the item that reached it', () => {
    const items = run(120, 'kanji')
    const { reached } = milestones(items, NOW)
    const hundred = reached.find(m => m.label === '100 kanji')
    expect(hundred.at.toISOString()).toBe(items[99].data.started_at)
  })

  it('offers the next step with how many to go and when at the recent rate', () => {
    // 120 kanji, one a day, so 30 in the last 30 days: a kanji a day
    const { next } = milestones(run(120, 'kanji'), NOW)
    const kanji = next.find(m => m.kind === 'kanji')
    expect(kanji).toMatchObject({ label: '250 kanji', togo: 130 })
    expect((kanji.at - NOW) / DAY).toBeCloseTo(130, 5)
  })

  it('has no date for a next step when nothing moved lately', () => {
    const { next } = milestones(run(120, 'kanji', 200), NOW)
    expect(next.find(m => m.kind === 'kanji').at).toBeNull()
  })

  it('never offers a step past everything WaniKani has', () => {
    // 260 radicals taught; the next step, 500, is more than the 499 there are
    const { next } = milestones(run(260, 'radical'), NOW, { radical: 499, kanji: 2000, vocabulary: 6000 })
    expect(next.find(m => m.kind === 'radical')).toBeUndefined()
    expect(milestones(run(260, 'radical'), NOW).next.find(m => m.kind === 'radical').label).toBe('500 radicals')
  })

  it('marks the first burn and counts burns by burned_at', () => {
    const burned = run(3, 'vocabulary', 0, { burned_at: ago(10) })
    burned[0].data.burned_at = ago(40)
    const { reached } = milestones(burned, NOW)
    expect(reached.find(m => m.label === 'first burn').at.toISOString()).toBe(ago(40))
  })

  it('counts vocabulary and kana vocabulary together, and every item once', () => {
    const { next } = milestones([...run(60, 'vocabulary'), ...run(50, 'kana_vocabulary')], NOW)
    expect(next.find(m => m.kind === 'vocabulary').togo).toBe(250 - 110)
    expect(next.find(m => m.kind === 'item').togo).toBe(250 - 110)
  })

  it('lists the reached newest first and the next soonest first', () => {
    const { next, reached } = milestones([...run(120, 'kanji'), ...run(260, 'vocabulary', 0)], NOW)
    expect(reached.map(m => m.at.getTime())).toEqual(reached.map(m => m.at.getTime()).sort((a, b) => b - a))
    const dated = next.filter(m => m.at)
    expect(dated.map(m => m.at.getTime())).toEqual(dated.map(m => m.at.getTime()).sort((a, b) => a - b))
  })
})

describe('burnsAhead', () => {
  it('counts only enlightened items, by the day their burn review comes', () => {
    const days = burnsAhead(
      [
        assignment({ srs_stage: 8, available_at: local(14, 22) }), // tonight
        assignment({ srs_stage: 8, available_at: local(16, 9) }), // in two days
        assignment({ srs_stage: 7, available_at: local(14, 22) }), // master: not a burn
        assignment({ srs_stage: 8, available_at: local(10, 8) }) // overdue: today
      ],
      NOW
    )
    expect(days.map(d => d.count)).toEqual([2, 0, 1, 0, 0, 0, 0])
  })
})

describe('paceToReach', () => {
  const DAY = 86400000
  const p = { current: { level: 15, days: 13 } }
  const by = days => new Date(NOW.getTime() + days * DAY)

  it('finds the slowest pace that reaches the level by the date', () => {
    // level 30 starts after the rest of this level plus 14 levels: at pace x,
    // max(0, x - 13) + 14x days. By day 200 that allows x = 14.
    expect(paceToReach(p, 15, 30, by(200), NOW, null, 7)).toBe(14)
  })

  it('rounds down, so the pace it names always gets there', () => {
    const pace = paceToReach(p, 15, 30, by(205), NOW, null, 7)
    expect(project(p, 15, pace, NOW).startOf(30) <= by(205)).toBe(true)
  })

  it('says null when even the fastest pace is too slow', () => {
    expect(paceToReach(p, 15, 60, by(100), NOW, null, 7)).toBeNull()
  })

  it('never beats the earliest level-up', () => {
    // the next level cannot start before the soonest level-up, whatever the pace
    const soonest = by(3)
    expect(paceToReach(p, 15, 16, by(2), NOW, soonest, 7)).toBeNull()
    expect(paceToReach(p, 15, 16, by(4), NOW, soonest, 7)).not.toBeNull()
  })

  it('has nothing to ask of a level already reached', () => {
    expect(paceToReach(p, 15, 15, by(100), NOW)).toBeNull()
  })

  // Day 4 of level 5: at 10 days a level, level 20 unlocks 146 days out. A
  // deadline an hour after that puts the break-even at 10.003 days a level —
  // a search that stopped a quarter step short of it rounded down to 9.5,
  // and a goal at the dial's own month said to go faster than the dial.
  it('names the step just under the break-even, however close it falls', () => {
    const early = { current: { level: 5, days: 4 } }
    const deadline = new Date(by(146).getTime() + DAY / 24)
    expect(paceToReach(early, 5, 20, deadline, NOW, null, 7, 0.5, 40)).toBe(10)
    expect(paceToReach(early, 5, 20, deadline, NOW, null, 1, 0.5, 200)).toBe(10)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MIN_MISSES,
  accuracy,
  earliestLevelUp,
  leeches,
  levelKanji,
  moved,
  nextUp,
  pace,
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

  it('times each passed level and projects 60 from the median', () => {
    const p = pace([prog(1, 1, 5), prog(2, 5, 11), prog(3, 11, 13)], 3, NOW)
    expect(p.levels.map(l => Math.round(l.days))).toEqual([4, 6])
    expect(p.levels.some(l => l.break)).toBe(false)
    expect(p.median).toBe(5)
    expect(p.current.days).toBeCloseTo(3.82, 1)
    // what is left of this level at the median, then 56 more levels
    const days = (p.eta - NOW) / 86400000
    expect(days).toBeCloseTo(5 - p.current.days + 56 * 5, 5)
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

  it('projects nothing at 60 or before a level has passed', () => {
    expect(pace([prog(1, 1, null)], 1, NOW).eta).toBeNull()
    expect(pace([prog(59, 1, 5), prog(60, 5, null)], 60, NOW).eta).toBeNull()
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

  it('puts a higher stage first whatever the lesson order, and keeps lesson order within a stage', () => {
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

  it('has no dates it cannot know', () => {
    const r = road({ levels: [], current: null, median: null }, 1, NOW)
    expect(r[0].at).toBeNull()
    expect(r[1].at).toBeNull()
  })
})

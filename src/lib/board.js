// 盤 The board — everything the dashboard counts, out of what the API
// already returned.
//
// Nothing here fetches and nothing here decides an SRS stage. Every stage,
// every next-review time, and every passed or burned date is WaniKani's,
// read off an assignment; this file only sorts them into days, levels and
// columns. The same rule as standing.js, for the same reason.

import { subjectTypeName } from './subject.js'

const DAY_MS = 24 * 60 * 60 * 1000
const BURNED = 9

// Local midnight at the start of the day `at` falls in, `offset` days on.
function midnight(at, offset = 0) {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() + offset)
  return day
}

// Reviews coming up, one bucket per local day for `days` days. Assignments
// are `/assignments?started=true`, which carry WaniKani's `available_at`.
//
// **Today holds the backlog.** Anything already due is due today — it is
// the first thing the day asks of you — so the first bucket counts from the
// beginning of time rather than from midnight, and lands on the same number
// the summary's due-now bucket plus the rest of today would.
//
// Burned items have no `available_at` and never come back; anything past
// the last bucket is outside the window.
export function week(assignments = [], now = new Date(), days = 7) {
  const ends = Array.from({ length: days }, (_, i) => midnight(now, i + 1).getTime())
  const buckets = ends.map((end, i) => ({ day: midnight(now, i), count: 0 }))

  for (const assignment of assignments) {
    const at = assignment?.data?.available_at
    if (!at || assignment.data.srs_stage === BURNED) continue
    const time = Date.parse(at)
    const index = ends.findIndex(end => time < end)
    if (index !== -1) buckets[index].count += 1
  }

  return buckets
}

// Lifetime accuracy, split the way WaniKani splits the question. Summed
// over answers rather than averaged over subjects, so an item reviewed a
// hundred times weighs a hundred times what one reviewed once does. Null for
// a side with no answers — radicals have no reading, and a new account has
// neither — never 100%.
export function accuracy(statistics = []) {
  let meaningRight = 0
  let meaningAll = 0
  let readingRight = 0
  let readingAll = 0

  for (const stat of statistics) {
    const d = stat?.data
    if (!d) continue
    meaningRight += d.meaning_correct ?? 0
    meaningAll += (d.meaning_correct ?? 0) + (d.meaning_incorrect ?? 0)
    readingRight += d.reading_correct ?? 0
    readingAll += (d.reading_correct ?? 0) + (d.reading_incorrect ?? 0)
  }

  return {
    meaning: meaningAll ? meaningRight / meaningAll : null,
    reading: readingAll ? readingRight / readingAll : null
  }
}

// An item has to have been missed this many times before it counts as
// slipping. Below it, one bad day on a new item reads as a leech.
export const MIN_MISSES = 3

// What keeps slipping: the lowest `percentage_correct` among items still in
// rotation. Burned items are out — they are finished, however they got
// there — which is why this needs the assignments as well as the
// statistics. Ties go to whichever has been missed more.
export function leeches(statistics = [], assignments = [], count = 5) {
  const burned = new Set(
    assignments.filter(a => a?.data?.srs_stage === BURNED).map(a => a.data.subject_id)
  )

  return statistics
    .map(stat => stat?.data)
    .filter(d => d && !burned.has(d.subject_id))
    .map(d => ({
      subjectId: d.subject_id,
      type: subjectTypeName(d.subject_type),
      percentage: d.percentage_correct,
      misses: (d.meaning_incorrect ?? 0) + (d.reading_incorrect ?? 0)
    }))
    .filter(item => item.misses >= MIN_MISSES && typeof item.percentage === 'number')
    .sort((a, b) => a.percentage - b.percentage || b.misses - a.misses)
    .slice(0, count)
}

// What moved up this week: items that reached guru for the first time
// (`passed_at`) and items that burned. Both are dates WaniKani stamped.
export function moved(assignments = [], now = new Date(), days = 7) {
  const since = now.getTime() - days * DAY_MS
  const within = at => at && Date.parse(at) > since
  return {
    guru: assignments.filter(a => within(a?.data?.passed_at)).length,
    burned: assignments.filter(a => within(a?.data?.burned_at)).length
  }
}

// How long each level took, and where that pace ends up.
//
// A level runs from `unlocked_at` to `passed_at`, which is how WaniKani
// times a level-up. After a reset the old records are still in the
// collection with `abandoned_at` set; they are dropped, and where a level
// appears twice the later one is the one that counts.
//
// The projection to 60 is the median rather than the mean, so one level
// that sat for a month does not move it: finish this level at the median
// (or now, if it has already run longer), then one median per level after.
export function pace(progressions = [], level, now = new Date()) {
  const byLevel = new Map()
  for (const p of progressions) {
    const d = p?.data
    if (!d || d.abandoned_at || !d.unlocked_at) continue
    const held = byLevel.get(d.level)
    if (!held || Date.parse(d.unlocked_at) > Date.parse(held.unlocked_at)) byLevel.set(d.level, d)
  }

  const days = (from, to) => (Date.parse(to) - Date.parse(from)) / DAY_MS

  const levels = [...byLevel.values()]
    .filter(d => d.passed_at && d.level < level)
    .sort((a, b) => a.level - b.level)
    .map(d => ({ level: d.level, days: days(d.unlocked_at, d.passed_at) }))

  const here = byLevel.get(level)
  const current = here ? { level, days: days(here.unlocked_at, now.toISOString()) } : null

  const median = middle(levels.map(l => l.days))

  let eta = null
  if (median !== null && level < 60) {
    const left = Math.max(0, median - (current?.days ?? 0)) + (60 - level - 1) * median
    eta = new Date(now.getTime() + left * DAY_MS)
  }

  return { levels, current, median, eta }
}

function middle(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
}

// The level's kanji, each with where it stands. `subjects` are the level's
// kanji subjects — all of them, locked ones included — and `assignments` are
// `/assignments?levels=N&subject_types=kanji`.
//
//   passed      — `passed_at` is set, which is what the level-up counts
//   apprentice  — started, not yet passed; `stage` is 1–4
//   lesson      — unlocked, waiting in lessons
//   locked      — no assignment yet; its radicals are still in the way
export function levelKanji(subjects = [], assignments = []) {
  const bySubject = new Map(assignments.map(a => [a?.data?.subject_id, a.data]))

  return [...subjects]
    .sort((a, b) => (a.data.lesson_position ?? 0) - (b.data.lesson_position ?? 0))
    .map(subject => {
      const a = bySubject.get(subject.id)
      const meaning = subject.data.meanings?.find(m => m.primary)?.meaning ?? ''
      const base = { id: subject.id, characters: subject.data.characters, meaning }
      if (!a) return { ...base, state: 'locked', stage: null, availableAt: null }
      if (a.passed_at) return { ...base, state: 'passed', stage: a.srs_stage, availableAt: a.available_at }
      if (!a.started_at) return { ...base, state: 'lesson', stage: 0, availableAt: null }
      return { ...base, state: 'apprentice', stage: a.srs_stage, availableAt: a.available_at }
    })
}

// The unpassed kanji of this level that come up soonest — the ones worth
// knowing the time of. Everything due at that same moment is grouped, and
// `oneStep` says whether every one of them sits at apprentice IV, where a
// right answer is what passes it. That is WaniKani's stage read back, not a
// prediction of one.
//
// Anything already due is one group, whatever hour it fell due in: `at` is
// null for that group, because the honest time is now.
export function nextUp(kanji = [], now = new Date()) {
  const waiting = kanji
    .filter(k => k.state === 'apprentice' && k.availableAt)
    .sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
  if (waiting.length === 0) return null

  const first = Date.parse(waiting[0].availableAt)
  const due = first <= now.getTime()
  const group = due
    ? waiting.filter(k => Date.parse(k.availableAt) <= now.getTime())
    : waiting.filter(k => Date.parse(k.availableAt) === first)
  return { at: due ? null : waiting[0].availableAt, kanji: group, oneStep: group.every(k => k.stage === 4) }
}

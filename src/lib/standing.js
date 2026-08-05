// Where you stand, as plain numbers.
//
// Home's job is to answer *which of the two worlds am I entering, and is it
// worth entering now*. Everything it needs to answer that is counted here,
// out of what the API already returned — nothing in this file fetches, and
// nothing decides an SRS stage. It reads the stage WaniKani recorded and
// puts it in a band.

import { subjectTypeName } from './subject.js'

// WaniKani's nine stages in the five bands people actually talk in. Burned
// last, because it is the one you stop thinking about.
export const BANDS = [
  { key: 'apprentice', from: 1, to: 4 },
  { key: 'guru', from: 5, to: 6 },
  { key: 'master', from: 7, to: 7 },
  { key: 'enlightened', from: 8, to: 8 },
  { key: 'burned', from: 9, to: 9 }
]

// One segmented hairline's worth of data. Assignments are resources from
// `/assignments?started=true`; anything not yet started has no stage and is
// not part of the spread.
export function spread(assignments = []) {
  const bands = BANDS.map(band => ({ ...band, count: 0 }))

  for (const assignment of assignments) {
    const stage = assignment?.data?.srs_stage
    if (typeof stage !== 'number') continue
    const band = bands.find(b => stage >= b.from && stage <= b.to)
    if (band) band.count += 1
  }

  return { bands, total: bands.reduce((sum, band) => sum + band.count, 0) }
}

// Every hour WaniKani bucketed — the current one, which holds everything
// available right now, and the 24 after it; the report carries all 25.
// `hours` clips the window for a caller that wants less, and the default
// clips nothing — a track labelled +24h was quietly dropping its last hour.
export function forecast(summary, hours = Infinity) {
  return (summary?.reviews ?? []).slice(0, hours).map(bucket => ({
    at: bucket.available_at,
    count: bucket.subject_ids?.length ?? 0
  }))
}

export function dueNow(summary) {
  return summary?.reviews?.[0]?.subject_ids?.length ?? 0
}

export function lessonsWaiting(summary) {
  return summary?.lessons?.[0]?.subject_ids?.length ?? 0
}

// What WaniKani's dashboard counts in its lessons card: not the queue but
// Today's Lessons — what remains of a daily maximum after the lessons
// already started today, never more than is actually waiting. The maximum
// is the mirrored setting from `pace.js`; without one there is nothing
// daily to count and the queue is the answer.
export function todaysLessons(available, started, pace) {
  if (!Number.isInteger(pace) || pace < 1) return available
  return Math.min(available, Math.max(0, pace - started))
}

// Lessons started at or after `since` (epoch ms), counted off the started
// collection the spread already fetched — `started_at` rides on every
// record in it. The summary only says what is waiting; what was done today,
// and when, is on the records of the doing.
export function startedSince(assignments = [], since) {
  return assignments.filter(a => Date.parse(a?.data?.started_at ?? '') >= since).length
}

// When something is next due, or null if nothing is in the next 24 hours.
// The first bucket with anything in it is the answer — including the current
// one, which means now.
export function nextDue(summary) {
  const bucket = (summary?.reviews ?? []).find(entry => (entry.subject_ids?.length ?? 0) > 0)
  return bucket?.available_at ?? null
}

// How much has been taught, by kind. Every assignment from
// `/assignments?started=true` has been through a lesson, so the collection
// already fetched for the spread answers this too — no second read.
//
// `kana_vocabulary` counts as vocabulary, the same as it does everywhere else.
export function learned(assignments = []) {
  const counts = { radical: 0, kanji: 0, vocabulary: 0 }

  for (const assignment of assignments) {
    const type = subjectTypeName(assignment?.data?.subject_type)
    if (type in counts) counts[type] += 1
  }

  return { ...counts, total: counts.radical + counts.kanji + counts.vocabulary }
}

// WaniKani levels you up when 90% of the level's kanji have passed — reached
// guru, which is what `passed_at` records.
export const LEVEL_UP_RATIO = 0.9

// Progress toward the next level, and the only figure on home that says how
// far off it is. `assignments` are from
// `/assignments?levels=N&subject_types=kanji` and carry the numerator;
// `total` is the level's kanji count from `getLevelKanjiCount`.
//
// **It takes two reads and the second is not optional.** An assignment
// exists only once its kanji is unlocked, so `assignments.length` is what
// you have reached rather than what the level holds, and it grows all
// through the level. Using it as the denominator makes `needed` grow too, so
// `remaining` reads as a handful at the start of a level that in fact wants
// thirty. The default is there so a caller without the count degrades to the
// old passed-of-reached line rather than to NaN — it is not a supported way
// to ask for `remaining`.
export function kanjiPassed(assignments = [], total = assignments.length) {
  const passed = assignments.filter(a => Boolean(a?.data?.passed_at)).length
  const needed = Math.ceil(total * LEVEL_UP_RATIO)
  return { passed, total, needed, remaining: Math.max(0, needed - passed) }
}

// The tallest bucket sets the scale; an empty forecast has no scale at all
// and every segment stays on the baseline.
export function peak(hours) {
  return hours.reduce((highest, hour) => Math.max(highest, hour.count), 0)
}

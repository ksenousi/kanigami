// Where you stand, as plain numbers.
//
// The board's headline counts, the spread and the forecast, counted out of
// what the API already returned — nothing in this file fetches, and nothing
// decides an SRS stage. It reads the stage WaniKani recorded and
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

// The week past the summary. WaniKani's report stops 24 hours out; beyond
// that each hour is counted from the `available_at` WaniKani set on the
// started assignments the board already holds — its times, read, not worked
// out. The summary's own buckets come first and are never recounted, so the
// day the board has always drawn stays exactly WaniKani's. Burned items have
// no next review and drop out. The week ends at the midnight that would
// begin a second of today's weekday, so no day's name appears twice.
export const AHEAD_HOURS = 7 * 24

export function forecastAhead(summary, assignments = [], most = AHEAD_HOURS) {
  const first = forecast(summary)
  if (first.length === 0) return first
  const start = Date.parse(first[0].at)
  const end = new Date(start)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 7)
  const length = Math.min(most, Math.round((end - start) / HOUR_MS))
  // Each hour's own items, for what is in it: the summary's by subject id,
  // the hours after by `available_at`.
  const bySubject = new Map(assignments.map(a => [a?.data?.subject_id, a]))
  const ids = (summary?.reviews ?? []).map(bucket => bucket.subject_ids ?? [])
  const hours = first.slice(0, length).map((hour, i) => ({
    ...hour,
    mix: mixOf((ids[i] ?? []).map(id => bySubject.get(id)).filter(Boolean))
  }))
  if (hours.length >= length) return hours
  const later = Array.from({ length }, () => [])
  for (const assignment of assignments) {
    const at = assignment?.data?.available_at
    if (!at) continue
    const index = Math.floor((Date.parse(at) - start) / HOUR_MS)
    if (index >= hours.length && index < length) later[index].push(assignment)
  }
  for (let i = hours.length; i < length; i++) {
    hours.push({ at: new Date(start + i * HOUR_MS).toISOString(), count: later[i].length, mix: mixOf(later[i]) })
  }
  return hours
}

// The stage a right answer moves an item out of its rank from, and the rank
// it moves into: apprentice IV to guru, guru II to master, and on. Read off
// the stage WaniKani recorded; the step is WaniKani's own ladder.
export const RANK_UP = { 4: 'guru', 6: 'master', 7: 'enlightened', 8: 'burned' }

// An hour's items by type — radicals, kanji, vocabulary, in that order and
// only those present — each with how many a right answer would move up a
// rank, by the rank they would move into. Asked for by the owner for the
// forecast's hour, the one place the board splits by type.
export function mixOf(assignments) {
  const kinds = new Map()
  for (const a of assignments) {
    const type = subjectTypeName(a?.data?.subject_type)
    if (!['radical', 'kanji', 'vocabulary'].includes(type)) continue
    if (!kinds.has(type)) kinds.set(type, { type, count: 0, up: {} })
    const kind = kinds.get(type)
    kind.count += 1
    const to = RANK_UP[a.data.srs_stage]
    if (to) kind.up[to] = (kind.up[to] ?? 0) + 1
  }
  return ['radical', 'kanji', 'vocabulary'].map(type => kinds.get(type)).filter(Boolean)
}

const HOUR_MS = 60 * 60 * 1000

export function dueNow(summary) {
  return summary?.reviews?.[0]?.subject_ids?.length ?? 0
}

export function lessonsWaiting(summary) {
  return summary?.lessons?.[0]?.subject_ids?.length ?? 0
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
// `total` is how many kanji `getLevelKanjiSubjects` returned.
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

// WaniKani names each decade of levels, and the board's road wears the
// names: 快 is levels 1–10, 苦 11–20, and so on to 現実, which stops at 60.
export const STAGES = [
  { kanji: '快', name: 'pleasant' },
  { kanji: '苦', name: 'painful' },
  { kanji: '死', name: 'death' },
  { kanji: '地獄', name: 'hell' },
  { kanji: '天国', name: 'paradise' },
  { kanji: '現実', name: 'reality' }
]

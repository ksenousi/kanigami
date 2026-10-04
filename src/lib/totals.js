// The denominators of home's learned line, kept for a week.
//
// How much of WaniKani there is moves a few times a year, and reading it
// costs three full first pages of /subjects for three integers — so the
// integers live in localStorage and the reads happen roughly weekly per
// device. This caches three numbers and a timestamp, not the subject
// database; the no-bulk-sync rule stands.

import { getSubjectTotals } from './wanikani.js'

const KEY = 'kanigami-totals'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// A record carries all three counts and when they were read — a
// half-written or foreign value in the slot is the same as nothing.
export function isComplete(record) {
  return Boolean(
    record &&
      typeof record.at === 'number' &&
      ['radical', 'kanji', 'vocabulary'].every(kind => typeof record[kind] === 'number')
  )
}

// A record is used without asking again while it is younger than a week.
export function isFresh(record, now) {
  return isComplete(record) && now - record.at < WEEK_MS
}

export async function subjectTotals(token, now = Date.now()) {
  let held = null
  try {
    held = JSON.parse(localStorage.getItem(KEY))
  } catch {
    // Unreadable is the same as absent.
  }
  if (isFresh(held, now)) return held

  // **A stale record beats none.** The totals move a few times a year, so
  // when the weekly read fails, last month's numbers are still the right
  // denominators to within a handful — and without them `taught` loses its
  // percentages and its totals entirely.
  let record
  try {
    record = { ...(await getSubjectTotals(token)), at: now }
  } catch (problem) {
    if (isComplete(held)) return held
    throw problem
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Private browsing with storage disabled — the fetched totals still
    // serve this visit.
  }
  return record
}

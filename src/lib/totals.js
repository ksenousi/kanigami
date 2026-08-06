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

// A record is usable when it is younger than a week and actually carries
// all three counts — a half-written or foreign value in the slot is the
// same as nothing.
export function isFresh(record, now) {
  return Boolean(
    record &&
      typeof record.at === 'number' &&
      now - record.at < WEEK_MS &&
      ['radical', 'kanji', 'vocabulary'].every(kind => typeof record[kind] === 'number')
  )
}

export async function subjectTotals(token, now = Date.now()) {
  let held = null
  try {
    held = JSON.parse(localStorage.getItem(KEY))
  } catch {
    // Unreadable is the same as absent.
  }
  if (isFresh(held, now)) return held

  const record = { ...(await getSubjectTotals(token)), at: now }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Private browsing with storage disabled — the fetched totals still
    // serve this visit.
  }
  return record
}

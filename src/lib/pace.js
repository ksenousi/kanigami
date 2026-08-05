// Home's lessons figure counts what WaniKani's dashboard counts: Today's
// Lessons — the "maximum recommended daily lessons" from its app settings,
// less the lessons already started today. That maximum is the one number in
// the arithmetic the API does not carry (`preferences` holds the batch size
// and nothing daily), so the dashboard's figure can only be rebuilt from a
// copy of the setting kept here, stored like the token: this device and
// nobody else. No copy stored means no pacing — the queue itself is the
// figure.

const KEY = 'kanigami-pace'

// WaniKani's own bounds for the setting. Its zero means "hide Today's
// Lessons", which here is the same as keeping no pace at all.
const LEAST = 1
const MOST = 100

export function readPace() {
  try {
    return asPace(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

// Takes anything, stores only a pace, and hands back what it stored — so a
// caller's state and the stored value cannot drift apart.
export function writePace(value) {
  const pace = asPace(value)
  try {
    if (pace === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(pace))
  } catch {
    // Private browsing with storage disabled — the pace holds for this
    // visit and will not survive a reload.
  }
  return pace
}

// A pace is a whole number of lessons from 1 to 100. Anything else — empty,
// zero, out of range, not a number — is no pace at all.
export function asPace(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const pace = Number(value)
  if (!Number.isInteger(pace)) return null
  return pace >= LEAST && pace <= MOST ? pace : null
}

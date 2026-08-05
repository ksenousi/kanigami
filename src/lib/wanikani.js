// WaniKani API v2 client.
//
// Everything here runs in the browser: WaniKani enables CORS, so a static
// site can talk to the API directly with the user's own personal token and
// no proxy in between. The token never leaves this device.
//
// Two rules the rest of the app depends on:
//   1. We never compute SRS stages ourselves. POST /reviews reports how many
//      times the user got the meaning and reading wrong; WaniKani decides
//      what that does to the stage and when the item comes back.
//   2. We only fetch subjects we are about to show. This client is
//      online-only by design — there is no full-database sync.

const BASE = 'https://api.wanikani.com/v2'
const REVISION = '20170710'

export class WaniKaniError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'WaniKaniError'
    this.status = status
  }
}

// The API allows 60 requests per minute and answers a burst with 429. A
// small token bucket keeps us under it without the caller thinking about it.
const RATE_LIMIT = 60
const WINDOW_MS = 60_000
let recent = []

async function throttle() {
  const now = Date.now()
  recent = recent.filter(t => now - t < WINDOW_MS)
  if (recent.length >= RATE_LIMIT) {
    const wait = WINDOW_MS - (now - recent[0]) + 50
    await new Promise(resolve => setTimeout(resolve, wait))
    return throttle()
  }
  recent.push(now)
}

async function request(token, path, options = {}) {
  await throttle()
  const url = path.startsWith('http') ? path : BASE + path
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Wanikani-Revision': REVISION,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })

  if (response.status === 401) {
    throw new WaniKaniError('That token was rejected. Check it in your WaniKani settings.', 401)
  }
  // A free account reaches level 3 and no further, and WaniKani refuses the
  // content above it rather than pretending it is not there. Saying so beats
  // showing somebody a bare 403.
  if (response.status === 403) {
    throw new WaniKaniError(
      'WaniKani refused that. A free account reaches level 3; past it, content ' +
        'needs a subscription. If you are subscribed, check the token has the ' +
        'permission this needs.',
      403
    )
  }
  if (response.status === 429) {
    // Somebody else on this device is using the same token. Wait it out once.
    await new Promise(resolve => setTimeout(resolve, 10_000))
    return request(token, path, options)
  }
  if (!response.ok) {
    throw new WaniKaniError(`WaniKani returned ${response.status}.`, response.status)
  }
  return response.json()
}

// Collection endpoints paginate at 500–1000 records. Follow next_url until
// the collection runs out and hand back one flat array of data objects.
async function collection(token, path) {
  const all = []
  let next = path
  while (next) {
    const page = await request(token, next)
    all.push(...page.data)
    next = page.pages?.next_url ?? null
  }
  return all
}

export function getUser(token) {
  return request(token, '/user').then(r => r.data)
}

export function getSummary(token) {
  return request(token, '/summary').then(r => r.data)
}

// A subscription's level cap, as the query filter that enforces it. The API
// keeps returning assignments above `max_level_granted` — a lapsed
// subscription leaves years of them behind — and the write endpoints refuse
// every one of them, so the docs put respecting the cap on the client. At
// the full 60 there is nothing to filter; below it, `levels` names each
// granted level and the server does the rest.
export function grantedLevels(maxLevel) {
  if (!Number.isInteger(maxLevel) || maxLevel >= 60) return ''
  return '&levels=' + Array.from({ length: maxLevel }, (_, i) => i + 1).join(',')
}

// Both session reads say `hidden=false`: a retired subject is out of lessons
// and reviews on WaniKani itself, and an assignment against one is a write
// the API will not take.
export function getAvailableReviews(token, maxLevel) {
  return collection(
    token,
    `/assignments?immediately_available_for_review&hidden=false${grantedLevels(maxLevel)}`
  )
}

export function getAvailableLessons(token, maxLevel) {
  return collection(
    token,
    `/assignments?immediately_available_for_lessons&hidden=false${grantedLevels(maxLevel)}`
  )
}

// Every assignment that has a stage on it, for the SRS spread. This is the
// one paginated read in the app that is not about a session, so fetch it once
// on mount and never on a timer. Retired subjects stay out — WaniKani drops
// them from its own counts, and an item that can never come back to review
// is not part of anyone's standing.
export function getStartedAssignments(token) {
  return collection(token, '/assignments?started=true&hidden=false')
}

// The kanji of one level that the user has actually reached. WaniKani levels
// you up at 90% of the level's kanji passed, so this carries the numerator —
// and `levels` is a server-side filter, which is why it is cheap rather than
// a scan. `hidden=false` because the denominator in `getLevelKanjiCount`
// already leaves retired kanji out; a numerator that counts them can pass
// more kanji than the level holds.
export function getLevelKanji(token, level) {
  return collection(token, `/assignments?levels=${level}&subject_types=kanji&hidden=false`)
}

// How many kanji the level *has*, which is a different question and the
// denominator of that 90%. An assignment does not exist until its kanji is
// unlocked — the radicals in it have to be passed first — so at the start of
// a level most of the level's kanji have none, and a denominator counted out
// of `getLevelKanji` above starts small and grows as you unlock. That reads
// as `4 kanji to level 11` on a level with thirty-two of them.
//
// Only the count is wanted, so this reads `total_count` off the response and
// follows no pagination; a level's kanji are a few dozen and fit one page
// whatever the page size. `hidden=false` leaves out subjects WaniKani has
// retired, which do not count toward levelling up.
export function getLevelKanjiCount(token, level) {
  return request(token, `/subjects?types=kanji&levels=${level}&hidden=false`).then(
    page => page.total_count
  )
}

// An id filter goes in the query string, and a full review queue is enough
// ids to make that string unreasonable. Chunk it.
function chunked(ids, size = 500) {
  const chunks = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

// Fetch only the subjects we are about to show.
export async function getSubjects(token, ids) {
  const pages = await Promise.all(
    chunked(ids).map(chunk => collection(token, `/subjects?ids=${chunk.join(',')}`))
  )
  return pages.flat()
}

// User synonyms and notes. The grader has to accept these as correct
// meanings, so they are fetched alongside the subjects, never after.
export async function getStudyMaterials(token, subjectIds) {
  const pages = await Promise.all(
    chunked(subjectIds).map(chunk =>
      collection(token, `/study_materials?subject_ids=${chunk.join(',')}`)
    )
  )
  return pages.flat()
}

export function submitReview(token, { assignmentId, incorrectMeaning, incorrectReading }) {
  return request(token, '/reviews', {
    method: 'POST',
    body: JSON.stringify({
      review: {
        assignment_id: assignmentId,
        incorrect_meaning_answers: incorrectMeaning,
        incorrect_reading_answers: incorrectReading
      }
    })
  }).then(r => r.data)
}

export function startAssignment(token, assignmentId) {
  return request(token, `/assignments/${assignmentId}/start`, {
    method: 'PUT',
    body: JSON.stringify({ assignment: {} })
  }).then(r => r.data)
}

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

export function getAvailableReviews(token) {
  return collection(token, '/assignments?immediately_available_for_review')
}

export function getAvailableLessons(token) {
  return collection(token, '/assignments?immediately_available_for_lessons')
}

// Fetch only the subjects we are about to show. ids= is capped in practice,
// so chunk it rather than building one enormous query string.
export async function getSubjects(token, ids) {
  const chunks = []
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
  const pages = await Promise.all(
    chunks.map(chunk => collection(token, `/subjects?ids=${chunk.join(',')}`))
  )
  return pages.flat()
}

// User synonyms and notes. The grader has to accept these as correct
// meanings, so they are fetched alongside the subjects, never after.
export function getStudyMaterials(token, subjectIds) {
  return collection(token, `/study_materials?subject_ids=${subjectIds.join(',')}`)
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

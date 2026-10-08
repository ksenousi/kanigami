// WaniKani API v2 client.
//
// Everything here runs in the browser: WaniKani enables CORS, so a static
// site can talk to the API directly with the user's own personal token and
// no proxy in between. The token never leaves this device.
//
// Two rules the rest of the app depends on:
//   1. Everything here reads. kanigami is a dashboard and asks for a token
//      with no permissions; there is no write call in this file, and adding
//      one is a decision, not a feature.
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

// A GET, always — there is no other kind of request in this app.
async function request(token, path) {
  await throttle()
  const url = path.startsWith('http') ? path : BASE + path
  // A request that never got an answer — offline, a dropped connection, an
  // iPad waking on bad Wi-Fi — throws the browser's own TypeError, which
  // reads "Load failed" in Safari. Say what happened instead. Status 0, so
  // nothing mistakes it for WaniKani rejecting the token.
  let response
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Wanikani-Revision': REVISION
      }
    })
  } catch {
    throw new WaniKaniError('WaniKani could not be reached. Check the connection and try again.', 0)
  }

  if (response.status === 401) {
    throw new WaniKaniError('That token was rejected. Check it in your WaniKani settings.', 401)
  }
  // A free account reaches level 3 and no further, and WaniKani refuses the
  // content above it rather than pretending it is not there. Saying so beats
  // showing somebody a bare 403.
  if (response.status === 403) {
    throw new WaniKaniError(
      'WaniKani refused that. A free account reaches level 3; past it, content ' +
        'needs a subscription.',
      403
    )
  }
  if (response.status === 429) {
    // Somebody else on this device is using the same token. Wait it out once.
    await new Promise(resolve => setTimeout(resolve, 10_000))
    return request(token, path)
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

// Every assignment that has a stage on it — the spread, the week, what was
// taught. Paginated and the largest read the board makes, so fetch it once
// on mount and never on a timer. Retired subjects stay out — WaniKani drops
// them from its own counts, and an item that can never come back to review
// is not part of anyone's standing.
export function getStartedAssignments(token) {
  return collection(token, '/assignments?started=true&hidden=false')
}

// The kanji of one level that the user has actually reached. WaniKani levels
// you up at 90% of the level's kanji passed, so this carries the numerator —
// and `levels` is a server-side filter, which is why it is cheap rather than
// a scan. `hidden=false` because the denominator in `getLevelKanjiSubjects`
// already leaves retired kanji out; a numerator that counts them can pass
// more kanji than the level holds.
export function getLevelKanji(token, level) {
  return collection(token, `/assignments?levels=${level}&subject_types=kanji&hidden=false`)
}

// Everything of one level the user has reached — radicals, kanji and
// vocabulary — for no more than its subject ids: which of what keeps
// slipping is this level's. Statistics carry no level, and the subjects that
// would say it are the bulk sync this app does not do. One page; a level is
// a few hundred subjects at most.
export function getLevelAssignments(token, level) {
  return collection(token, `/assignments?levels=${level}&hidden=false`)
}

// The kanji the level *has*, which is a different question and the
// denominator of that 90%. An assignment does not exist until its kanji is
// unlocked — the radicals in it have to be passed first — so at the start of
// a level most of the level's kanji have none, and a denominator counted out
// of `getLevelKanji` above starts small and grows as you unlock. That reads
// as `4 kanji to level 11` on a level with thirty-two of them.
//
// The dashboard draws every one of them, locked ones included, so this reads
// the subjects rather than just `total_count` — a few dozen, one page, and
// exactly the subjects on screen, so the no-bulk-sync rule stands.
// `hidden=false` leaves out subjects WaniKani has retired, which do not
// count toward levelling up.
export function getLevelKanjiSubjects(token, level) {
  return collection(token, `/subjects?types=kanji&levels=${level}&hidden=false`)
}

// The level's radicals and what you have reached of them — the same pair of
// reads as the kanji above, for the grid the board folds away until asked.
// One page each, and only when it is opened.
export function getLevelRadicals(token, level) {
  return Promise.all([
    collection(token, `/subjects?types=radical&levels=${level}&hidden=false`),
    collection(token, `/assignments?levels=${level}&subject_types=radical&hidden=false`)
  ])
}

// The level's vocabulary, kana-only words included, and what you have
// reached of it — the same pair again, for the third word in the level's
// head. A level holds up to a couple of hundred words: one or two pages
// each, and still only the subjects on screen, read only when asked for.
export function getLevelVocabulary(token, level) {
  return Promise.all([
    collection(token, `/subjects?types=vocabulary,kana_vocabulary&levels=${level}&hidden=false`),
    collection(token, `/assignments?levels=${level}&subject_types=vocabulary,kana_vocabulary&hidden=false`)
  ])
}

// Lifetime right and wrong answers per subject — the dashboard's accuracy
// and what keeps slipping. Paginated like the started assignments and about
// as large, so it is read once on mount and never on a timer. Retired
// subjects stay out, as they do everywhere.
export function getReviewStatistics(token) {
  return collection(token, '/review_statistics?hidden=false')
}

// One record per level reached, with when it unlocked and when it passed —
// how long each level took. Sixty at most, one page.
export function getLevelProgressions(token) {
  return collection(token, '/level_progressions')
}

// WaniKani's SRS interval tables — two records, one page. The board runs
// them forward to say when this level could be over at the soonest, which
// is why they are read rather than copied into the app: WaniKani can change
// them, and levels 1–2 use the accelerated one.
export function getSpacedRepetitionSystems(token) {
  return collection(token, '/spaced_repetition_systems')
}

// How much of WaniKani there is, by kind — the denominators of home's
// learned line. `total_count` off one filtered page per kind, the same
// trick getLevelKanjiSubjects once used; `hidden=false`, or the retired inflate a
// total nobody can reach. Kana vocabulary counts as vocabulary, the same
// as it does everywhere else. Callers cache what this returns — see
// totals.js — because each of the three reads hauls a full first page of
// subjects along with its one useful integer.
export function getSubjectTotals(token) {
  const count = types =>
    request(token, `/subjects?types=${types}&hidden=false`).then(page => page.total_count)
  return Promise.all([
    count('radical'),
    count('kanji'),
    count('vocabulary,kana_vocabulary')
  ]).then(([radical, kanji, vocabulary]) => ({ radical, kanji, vocabulary }))
}

// Every kanji WaniKani teaches, at every level — for coverage, which has to
// know what each level ahead will teach. **The one read that bends "never
// bulk-sync"**, on the owner's say-so: about 2,100 subjects in three pages,
// some 4 MB of JSON, read at most once a week and kept as id, level and
// character only (`kanjiIndex`). Nothing else from it is stored or shown.
export function getAllKanjiSubjects(token) {
  return collection(token, '/subjects?types=kanji&hidden=false')
}

// Every radical and word WaniKani teaches, at every level — for taught's
// slider, which has to know what each level ahead will add. **The second
// read that bends "never bulk-sync"**, on the owner's say-so once its cost
// was laid out: about 7,200 subjects in eight pages, some 30–40 MB of JSON
// (the words carry their audio), read at most once a week and kept as id,
// level and type only (`aheadIndex`). Nothing else from it is stored or
// shown.
export function getAllRadicalAndVocabularySubjects(token) {
  return collection(token, '/subjects?types=radical,vocabulary,kana_vocabulary&hidden=false')
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

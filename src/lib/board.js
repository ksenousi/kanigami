// 盤 The board — everything the dashboard counts, out of what the API
// already returned.
//
// Nothing here fetches. Every stage, every next-review time, and every
// passed or burned date is WaniKani's, read off an assignment; this file
// sorts them into days, levels and columns. The one place it looks forward
// is `earliestLevelUp`, and that runs WaniKani's own interval table, read
// from the API, rather than one of ours.

import { BANDS, STAGES } from './standing.js'
import { glyphFor, pageFor, subjectTypeName } from './subject.js'

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

// Right answers by level: every answer ever given on a level's items, meaning
// and reading together, summed the way `accuracy` sums them. **Not how you
// did while on the level** — WaniKani keeps lifetime totals per subject and
// no dated history, so level 7's figure counts every review of level 7's
// items to today. `levelOf` maps subject id to level, from the kanji and
// ahead indexes; a statistic it cannot place is left out. `levels[n]` is null
// for a level with no answers. `overall` is over the same answers.
export function accuracyByLevel(statistics = [], levelOf = new Map(), top = 60) {
  const right = Array.from({ length: top + 1 }, () => 0)
  const all = Array.from({ length: top + 1 }, () => 0)
  for (const stat of statistics) {
    const d = stat?.data
    const level = d && levelOf.get(d.subject_id)
    if (!level || level > top) continue
    const r = (d.meaning_correct ?? 0) + (d.reading_correct ?? 0)
    right[level] += r
    all[level] += r + (d.meaning_incorrect ?? 0) + (d.reading_incorrect ?? 0)
  }
  const sum = list => list.reduce((a, b) => a + b, 0)
  return {
    levels: all.map((n, l) => (n ? { share: right[l] / n, answers: n } : null)),
    overall: sum(all) ? sum(right) / sum(all) : null
  }
}

// The stages a whole level can stand at, from the first `srs.js` names
// guru: guru I and II, master, enlightened, burned — read off assignments.
export const LEVEL_STANDINGS = [
  { key: 'guru', from: 5 },
  { key: 'master', from: 7 },
  { key: 'enlightened', from: 8 },
  { key: 'burned', from: 9 }
]

// How far each level has come as a whole: the stage of its least-advanced
// radical, kanji or word, as its assignment says, named by the highest
// standing that stage reaches — so a level is burned only when every item on
// it is. `levelOf` maps subject id to level, from the kanji and ahead
// indexes, so a subject never started holds its level back. A level with
// anything below guru is left out, and drops back out if an item falls.
export function levelStandings(levelOf = new Map(), assignments = [], top = 60) {
  const stage = new Map(assignments.map(a => [a?.data?.subject_id, a?.data?.srs_stage]))
  const lowest = new Map()
  for (const [id, level] of levelOf) {
    if (!level || level > top) continue
    const at = typeof stage.get(id) === 'number' ? stage.get(id) : -1
    lowest.set(level, Math.min(lowest.get(level) ?? Infinity, at))
  }
  const standings = new Map()
  for (const [level, at] of lowest) {
    const reached = LEVEL_STANDINGS.filter(s => at >= s.from).pop()
    if (reached) standings.set(level, reached.key)
  }
  return standings
}

// Each level's started items by type and SRS rank: for a level, how many of
// its radicals, kanji and vocabulary sit at apprentice, guru, master,
// enlightened and burned — read off each assignment's stage. `levelOf` maps
// subject id to level, from the kanji and ahead indexes. Asked for by the
// owner for a pace bar's readout.
export function levelSpreads(levelOf = new Map(), assignments = [], top = 60) {
  const spreads = new Map()
  for (const a of assignments) {
    const d = a?.data
    const level = levelOf.get(d?.subject_id)
    if (!level || level > top || typeof d.srs_stage !== 'number' || d.srs_stage < 1) continue
    const type = subjectTypeName(d.subject_type)
    const band = BANDS.find(b => d.srs_stage >= b.from && d.srs_stage <= b.to)
    if (!band || !['radical', 'kanji', 'vocabulary'].includes(type)) continue
    if (!spreads.has(level)) spreads.set(level, { radical: {}, kanji: {}, vocabulary: {} })
    const kind = spreads.get(level)[type]
    kind[band.key] = (kind[band.key] ?? 0) + 1
  }
  return spreads
}

// What moved this week, by the only three dates an assignment carries:
// lessons started into apprentice (`started_at`), first arrivals at guru
// (`passed_at`), and burns (`burned_at`). Master and enlightened are not
// here because WaniKani stamps no date for reaching them, and the review
// history that could reconstruct one is disabled on their side — a count
// for either would be invented.
export function moved(assignments = [], now = new Date(), days = 7) {
  const since = now.getTime() - days * DAY_MS
  const within = at => at && Date.parse(at) > since
  const count = field => assignments.filter(a => within(a?.data?.[field])).length
  return {
    apprentice: count('started_at'),
    guru: count('passed_at'),
    burned: count('burned_at')
  }
}

// A level that took more than this many times the median is a break, not
// a pace. WaniKani keeps no history of vacations — `/user` only says
// whether one is on now — so a break can only be recognised by its length.
export const BREAK_FACTOR = 3

// How long each level took, and where that pace ends up.
//
// A level runs from `unlocked_at` to `passed_at`, which is how WaniKani
// times a level-up. After a reset the old records are still in the
// collection with `abandoned_at` set; they are dropped, and where a level
// appears twice the later one is the one that counts.
//
// **Breaks are left out.** A level that sat for months says when you
// stopped, not how fast you go, so any level over BREAK_FACTOR × the median
// of all of them is marked `break` and kept out of the median the
// projection runs on. The median is taken again without them.
//
// `recent` is the median of the last RECENT of those — where the pace is
// now, which a long history can hide. Both mark the pace dial. The
// projection itself is `project`'s, at whatever pace the dial is set to.
export const RECENT = 5

export function pace(progressions = [], level, now = new Date()) {
  const byLevel = new Map()
  for (const p of progressions) {
    const d = p?.data
    if (!d || d.abandoned_at || !d.unlocked_at) continue
    const held = byLevel.get(d.level)
    if (!held || Date.parse(d.unlocked_at) > Date.parse(held.unlocked_at)) byLevel.set(d.level, d)
  }

  const days = (from, to) => (Date.parse(to) - Date.parse(from)) / DAY_MS

  const timed = [...byLevel.values()]
    .filter(d => d.passed_at && d.level < level)
    .sort((a, b) => a.level - b.level)
    .map(d => ({ level: d.level, days: days(d.unlocked_at, d.passed_at), unlockedAt: d.unlocked_at }))

  const overall = middle(timed.map(l => l.days))
  const levels = timed.map(l => ({ ...l, break: overall !== null && l.days > BREAK_FACTOR * overall }))

  const here = byLevel.get(level)
  const current = here
    ? { level, days: days(here.unlocked_at, now.toISOString()), unlockedAt: here.unlocked_at }
    : null

  const kept = levels.filter(l => !l.break).map(l => l.days)
  const median = middle(kept)
  const recent = middle(kept.slice(-RECENT))

  return { levels, current, median, recent }
}

// How a median came out: the levels it was taken over, quickest first, and
// the one or two in the middle that make it — the working the median and
// last-five marks show when pointed at. `levels` are `pace().levels`, or the
// last RECENT of them; breaks are left out, as they are from both medians.
// A tie keeps level order.
export function medianWorking(levels = []) {
  const sorted = levels.filter(l => !l.break).sort((a, b) => a.days - b.days || a.level - b.level)
  if (sorted.length === 0) return null
  const half = Math.floor(sorted.length / 2)
  const middle = sorted.length % 2 ? [sorted[half]] : [sorted[half - 1], sorted[half]]
  return { sorted, middle }
}

// Where the levels from here fall at `perLevel` days a level — the pace
// dial's projection, and the road's.
//
// This level ends once it has run `perLevel` days, or now if it already has,
// and never before `soonest`, the earliest level-up: no pace beats WaniKani's
// own intervals, so a fast dial waits on them. Then one level every
// `perLevel` days. `startOf(n)` is when level n would unlock, null for one
// already reached; `done` is when level 60 would be passed. Null with no
// pace to run at.
export function project(p, level, perLevel, now = new Date(), soonest = null) {
  if (!(perLevel > 0)) return null
  const left = Math.max(0, perLevel - (p?.current?.days ?? 0)) * DAY_MS
  const next = Math.max(now.getTime() + left, soonest ? soonest.getTime() : 0)
  const step = perLevel * DAY_MS
  return {
    startOf: n => (n <= level || n > 60 ? null : new Date(next + (n - level - 1) * step)),
    done: new Date(level >= 60 ? next : next + (60 - level) * step)
  }
}

// The fewest days a level can take: every radical passed at the soonest,
// which unlocks the kanji, every kanji passed at the soonest after that —
// two runs through the apprentice stages of `system`, lessons done the
// moment they unlock. Read off WaniKani's table, so the accelerated levels
// and any change WaniKani makes come with it. Null without the table.
export function fastestLevel(system) {
  if (!system) return null
  let total = 0
  for (let stage = 1; stage < system.passing; stage++) {
    if (typeof system.waits[stage] !== 'number') return null
    total += system.waits[stage]
  }
  return (2 * total) / DAY_MS
}

// The six decades WaniKani names, each with where you stand in it: `done`,
// `current`, or `ahead`. A decade you have reached carries the date you
// entered it — the unlock of its first level, read off the progressions —
// and one ahead carries `project`'s date for its first level, at
// `perLevel` (the median unless the dial says otherwise). Either can be
// null: a reset can leave a first level with no record, and there is no
// projection before a level has passed.
export function road(p, level, now = new Date(), perLevel = p?.median, soonest = null) {
  const unlocked = new Map([...(p?.levels ?? []), ...(p?.current ? [p.current] : [])].map(l => [l.level, l.unlockedAt]))
  const ahead = project(p, level, perLevel, now, soonest)

  return STAGES.map((stage, i) => {
    const first = i * 10 + 1
    const last = i * 10 + 10
    const state = level > last ? 'done' : level >= first ? 'current' : 'ahead'
    let at = null
    if (state !== 'ahead') {
      at = unlocked.get(first) ? new Date(unlocked.get(first)) : null
    } else if (ahead) {
      at = ahead.startOf(first)
    }
    return { ...stage, first, last, state, at }
  })
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
//
// Ordered by progress, furthest first: passed kanji by stage, then
// apprentice IV down to I, then waiting in lessons, then locked — so the
// grid reads as how far through the level you are, and the ones still to
// pass sit together at the end. Within a stage, the one WaniKani asks for
// next comes first, by `available_at`; kanji with no review coming (in
// lessons, locked, burned) keep WaniKani's lesson order.
export function levelKanji(subjects = [], assignments = []) {
  const bySubject = new Map(assignments.map(a => [a?.data?.subject_id, a.data]))

  return [...subjects]
    .sort((a, b) => (a.data.lesson_position ?? 0) - (b.data.lesson_position ?? 0))
    .map(subject => {
      const a = bySubject.get(subject.id)
      const meaning = subject.data.meanings?.find(m => m.primary)?.meaning ?? ''
      // The primary reading — two where WaniKani marks two. A radical has
      // none, and kana vocabulary is its own reading; both come out empty.
      const kana = (subject.data.readings ?? []).filter(r => r.primary).map(r => r.reading).join('、')
      const base = {
        id: subject.id,
        characters: subject.data.characters,
        // A radical may have no codepoint; the grid draws WaniKani's image.
        image: glyphFor(subject.data).image,
        meaning,
        kana,
        url: pageFor(subject.data),
        system: subject.data.spaced_repetition_system_id,
        // A kanji's radicals, WaniKani's own list — what keeps it locked.
        components: subject.data.component_subject_ids ?? []
      }
      if (!a) return { ...base, state: 'locked', stage: null, availableAt: null }
      if (a.passed_at) return { ...base, state: 'passed', stage: a.srs_stage, availableAt: a.available_at }
      if (!a.started_at) return { ...base, state: 'lesson', stage: 0, availableAt: null }
      return { ...base, state: 'apprentice', stage: a.srs_stage, availableAt: a.available_at }
    })
    .sort((a, b) => progress(b) - progress(a) || soonest(a) - soonest(b))
}

// When a kanji next comes up, as a number to sort by; one with no review
// coming sorts after every one that has. Ties keep the lesson order.
function soonest(k) {
  return k.availableAt ? Date.parse(k.availableAt) : Infinity
}

// How far a kanji has come, as one number to sort by. Locked is below a
// lesson waiting, which is below apprentice I.
function progress(k) {
  if (k.state === 'locked') return -1
  if (k.state === 'lesson') return 0
  return k.stage ?? 0
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

const UNIT_MS = {
  milliseconds: 1,
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: DAY_MS,
  weeks: 7 * DAY_MS
}

// WaniKani's SRS systems, from `/spaced_repetition_systems`, as what the
// projection needs: for each system, the stage that passes and how long
// each stage waits before its next review. Levels 1–2 run the accelerated
// system, which is why this is read rather than written down.
export function srsSystems(records = []) {
  const systems = new Map()
  for (const record of records) {
    const d = record?.data
    if (!d?.stages) continue
    const waits = []
    for (const stage of d.stages) {
      waits[stage.position] =
        typeof stage.interval === 'number' ? stage.interval * (UNIT_MS[stage.interval_unit] ?? 1000) : null
    }
    systems.set(record.id, { passing: d.passing_stage_position, waits })
  }
  return systems
}

const HOUR_MS = 60 * 60 * 1000
const toHour = time => Math.floor(time / HOUR_MS) * HOUR_MS

// When one kanji could pass at the soonest: every review answered right, at
// the moment it comes up. Each right answer moves it one stage and it comes
// back that stage's wait later, rounded down to the hour the way WaniKani
// schedules. An item still in lessons starts now; a locked one cannot be
// projected, because it waits on its radicals.
function earliestPass(kanji, system, now) {
  if (!system || kanji.state === 'passed' || kanji.state === 'locked') return null

  let stage = kanji.state === 'lesson' ? 0 : kanji.stage
  let time = kanji.state === 'lesson' ? now : Math.max(Date.parse(kanji.availableAt), now)
  // Starting a lesson is the move to stage 1; after that, each review.
  for (;;) {
    stage += 1
    if (stage >= system.passing) return time
    const wait = system.waits[stage]
    if (typeof wait !== 'number') return null
    time = toHour(time + wait)
  }
}

// The earliest this level could be over: the moment the `remaining`-th
// soonest kanji passes, if every answer from here is right. A projection,
// and the screen says so — one miss moves it by days.
//
// `waitsOnLocked` is set when there are not enough unlocked kanji left to
// reach the threshold, so the level-up hangs on kanji whose radicals come
// first. `at` is then null, and `chained` carries the soonest anyway when the
// level's `radicals` are given: a locked kanji unlocks the moment the last
// of its level's radicals passes at the soonest, its lesson is taken then,
// and it runs the apprentice stages from there. A locked kanji none of the
// level's radicals hold waits on something unread, and gets no time; when
// that leaves too few, `chained` is null too.
export function earliestLevelUp(kanji = [], systems = new Map(), remaining = 0, now = new Date(), radicals = null) {
  if (remaining <= 0) return null
  const passes = kanji
    .map(k => earliestPass(k, systems.get(k.system), now.getTime()))
    .filter(time => time !== null)
    .sort((a, b) => a - b)
  if (passes.length >= remaining) return { at: new Date(passes[remaining - 1]), waitsOnLocked: false }
  if (!radicals) return { at: null, waitsOnLocked: true }

  const radicalAt = new Map(
    radicals.filter(r => r.state !== 'passed').map(r => [r.id, earliestPass(r, systems.get(r.system), now.getTime())])
  )
  const unlocks = kanji
    .filter(k => k.state === 'locked')
    .map(k => {
      const holding = (k.components ?? []).filter(id => radicalAt.has(id))
      if (holding.length === 0) return null
      const times = holding.map(id => radicalAt.get(id))
      if (times.some(t => t === null)) return null
      return earliestPass({ ...k, state: 'lesson' }, systems.get(k.system), Math.max(...times))
    })
    .filter(time => time !== null)
  const all = [...passes, ...unlocks].sort((a, b) => a - b)
  return { at: null, waitsOnLocked: true, chained: all.length >= remaining ? new Date(all[remaining - 1]) : null }
}

// What keeps the level's locked kanji locked: for each of the level's
// radicals not yet passed, the locked kanji that list it among their
// components, soonest radical first. WaniKani unlocks a kanji once every
// radical in it has passed; which radicals those are is WaniKani's own
// `component_subject_ids`, read, not worked out.
//
// `at` is the soonest the radical could pass, every answer right, on
// WaniKani's own intervals — a projection, like the level-up. `others` are
// locked kanji none of this level's radicals hold: they wait on something
// else, a radical from another level.
export function lockedBehind(kanji = [], radicals = [], systems = new Map(), now = new Date()) {
  const locked = kanji.filter(k => k.state === 'locked')
  const blockers = radicals
    .filter(r => r.state !== 'passed')
    .map(r => {
      const at = earliestPass(r, systems.get(r.system), now.getTime())
      return { radical: r, holds: locked.filter(k => k.components?.includes(r.id)), at: at === null ? null : new Date(at) }
    })
    .filter(b => b.holds.length > 0)
    .sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity))
  const held = new Set(blockers.flatMap(b => b.holds.map(k => k.id)))
  return { blockers, others: locked.filter(k => !held.has(k.id)) }
}

// Round numbers worth marking, for every count the board keeps.
const STEPS = [100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
const RATE_DAYS = 30

// The count milestones: for radicals, kanji and vocabulary taught, all items
// taught, and items burned — every round number already passed, dated, and
// the next one for each, with how many to go.
//
// **Dated by WaniKani, never estimated, for the ones reached.** The 500th
// kanji is reached on the `started_at` of the 500th kanji started; the first
// burn on the earliest `burned_at`. The next one carries `at`, a projection:
// the rate of the last RATE_DAYS days carried forward, null when nothing
// moved in them. A step past everything WaniKani has (`totals`, when known)
// is never offered as next.
export function milestones(assignments = [], now = new Date(), totals = null) {
  const dates = { radical: [], kanji: [], vocabulary: [], item: [], burned: [] }
  for (const a of assignments) {
    const d = a?.data
    if (!d) continue
    if (d.started_at) {
      const type = subjectTypeName(d.subject_type)
      if (type in dates && type !== 'item') dates[type].push(Date.parse(d.started_at))
      dates.item.push(Date.parse(d.started_at))
    }
    if (d.burned_at) dates.burned.push(Date.parse(d.burned_at))
  }

  // `taught`, not `items`: one number, one name across the board.
  const words = { radical: 'radicals', kanji: 'kanji', vocabulary: 'vocabulary', item: 'taught', burned: 'burned' }
  const ceiling = totals
    ? { radical: totals.radical, kanji: totals.kanji, vocabulary: totals.vocabulary, item: totals.radical + totals.kanji + totals.vocabulary, burned: totals.radical + totals.kanji + totals.vocabulary }
    : {}
  const since = now.getTime() - RATE_DAYS * DAY_MS

  const reached = []
  const next = []
  for (const [kind, list] of Object.entries(dates)) {
    list.sort((a, b) => a - b)
    const count = list.length
    const label = step => `${step.toLocaleString('en')} ${words[kind]}`
    if (kind === 'burned' && count > 0) reached.push({ kind, label: 'first burn', at: new Date(list[0]) })
    for (const step of STEPS) {
      if (step <= count) {
        reached.push({ kind, step, label: label(step), at: new Date(list[step - 1]) })
        continue
      }
      if (ceiling[kind] !== undefined && step > ceiling[kind]) break
      const recent = list.filter(t => t > since).length
      const togo = step - count
      const at = recent > 0 ? new Date(now.getTime() + (togo / (recent / RATE_DAYS)) * DAY_MS) : null
      next.push({ kind, step, label: label(step), togo, at })
      break
    }
  }

  next.sort((a, b) => (a.at === null) - (b.at === null) || a.at - b.at || a.togo - b.togo)
  reached.sort((a, b) => b.at - a.at)
  return { next, reached }
}

// What the level-up waits on, for the 24-hour strip: every kanji of the
// level not yet passed, and every radical not yet passed that holds one of
// its locked kanji. Any of the kanji can be among the ones that pass, so
// none is dropped for ranking behind another — taking only the `remaining`
// soonest left a kanji due in the same hour as two marked ones unmarked,
// and the radical that unlocks the rest off the strip altogether.
export function levelUpItems(kanji = [], radicals = [], remaining = 0) {
  if (remaining <= 0) return []
  const locked = kanji.filter(k => k.state === 'locked')
  const holding = (radicals ?? []).filter(r => r.state !== 'passed' && locked.some(k => k.components?.includes(r.id)))
  return [...kanji.filter(k => k.state !== 'passed' && k.state !== 'locked'), ...holding.map(r => ({ ...r, radical: true }))]
}

// The slowest pace that still reaches `target` by `by`, rounded down to
// `step`: what a goal asks of you. Null when even `fastest` days a level
// cannot — no pace beats WaniKani's intervals or the earliest level-up.
// Past `slowest` the answer is `slowest`; any pace from there gets you in.
export function paceToReach(p, level, target, by, now = new Date(), soonest = null, fastest = 1, step = 0.5, slowest = 200) {
  if (target <= level) return null
  const reaches = pace => project(p, level, pace, now, soonest).startOf(target) <= by
  if (!reaches(fastest)) return null
  if (reaches(slowest)) return slowest
  let lo = fastest
  let hi = slowest
  while (hi - lo > step / 4) {
    const mid = (lo + hi) / 2
    if (reaches(mid)) lo = mid
    else hi = mid
  }
  // The break-even lies between lo and hi, so the answer is the step under
  // hi if that reaches, else the one below. Rounding lo down instead dropped
  // a whole step whenever the break-even sat just over one.
  let pace = Math.floor(hi / step) * step
  while (pace > lo && !reaches(pace)) pace -= step
  return Math.max(fastest, pace)
}

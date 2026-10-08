import { useEffect, useRef, useState } from 'react'
import {
  getLevelAssignments,
  getLevelKanji,
  getLevelRadicals,
  getLevelVocabulary,
  getLevelKanjiSubjects,
  getLevelProgressions,
  getReviewStatistics,
  getSpacedRepetitionSystems,
  getStartedAssignments,
  getSubjects,
  getSummary,
  getUser
} from '../lib/wanikani.js'
import { dueNow, kanjiPassed, learned, lessonsWaiting, spread } from '../lib/standing.js'
import {
  accuracy,
  burnsAhead,
  earliestLevelUp,
  fastestLevel,
  FIELD,
  leeches,
  levelKanji,
  MIN_MISSES,
  levelUpKanji,
  lockedBehind,
  milestones,
  moved,
  nextUp,
  pace,
  paceToReach,
  partnerFor,
  project,
  road,
  SLIPPING,
  srsSystems
} from '../lib/board.js'
import { glyphFor, pageFor } from '../lib/subject.js'
import { clock, count as many, dayMonth, dayMonthYear, monthYear, roughly, weekday, when } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import { subjectTotals } from '../lib/totals.js'
import { kanjiIndex } from '../lib/kanjiIndex.js'
import { coverage, taughtKanji, throughLevel } from '../lib/coverage.js'
import { aheadByLevel, aheadIndex } from '../lib/aheadIndex.js'
import Forecast from './Forecast.jsx'
import Hint from './Hint.jsx'
import useOnline from './useOnline.js'
import usePointing from './usePointing.js'

// 盤 The board — the whole app. Decided from a prototype: of four
// directions (everything at once, time leads, the level is the page, the
// almanac) and four branches of the first, the original "everything at
// once" was picked. See "The dashboard" in PLAN.md.
//
// A headline row of figures, then three columns: the level, where the
// reviews stand, and what is slipping. Then the pace dial and the road, full
// width, and the footline: home's forecast.
//
// It reads and never writes, so it wants a token with no permissions at
// all. The four reads the screen cannot stand without fail it together and
// draw it as soon as they land; the rest are commentary — statistics, level
// history, WaniKani's totals, the SRS tables — and fill in after, each
// degrading to null and taking only its own line down with it.
//
// **Read once, then again when it has gone stale** — never on a timer. A
// tab left open on an iPad lives for days, and a board read on Monday says
// Monday's due count on Thursday. Coming back to the tab, or back online,
// more than STALE_MS after the last read reads it all again, and the
// masthead says when the figures were read and re-reads on a tap.
const STALE_MS = 10 * 60 * 1000

export default function Dashboard({ token, user, onUser, onDisconnect }) {
  const [board, setBoard] = useState(null)
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(true)
  // The pace dial's setting, held here because coverage's dates run on it
  // too. Null is the median.
  const [chosenPace, setChosenPace] = useState(null)
  const readAt = useRef(0)
  const online = useOnline()

  useEffect(() => {
    let live = true
    setFailure(null)
    setBusy(true)
    const optional = read => read.catch(() => null)
    const now = new Date()

    const core = Promise.all([
      getSummary(token),
      getStartedAssignments(token),
      getLevelKanji(token, user.level),
      getLevelKanjiSubjects(token, user.level)
    ])
    const commentary = Promise.all([
      optional(getReviewStatistics(token)),
      optional(getLevelProgressions(token)),
      optional(subjectTotals(token)),
      optional(getSpacedRepetitionSystems(token)),
      optional(getLevelAssignments(token, user.level)),
      // The level's radicals, for the level line's count of what still
      // holds locked kanji back — read up front now, and handed to the grid's
      // switch so it never reads them twice.
      optional(getLevelRadicals(token, user.level))
    ])
    // Coverage's two reads, apart from the rest: the kanji index is the
    // largest read the app makes, and the lists are a chunk of their own, so
    // nothing else on the board waits for either.
    const extra = Promise.all([optional(kanjiIndex(token)), optional(import('../lib/kanjiLists.js'))])
    // Taught's radicals and words ahead: larger still, so it waits on nothing
    // and nothing waits on it — without it, those two lines stay at now.
    const later = optional(aheadIndex(token))

    core
      .then(([summary, started, levelAssignments, levelSubjects]) => {
        if (!live) return
        const kanji = levelKanji(levelSubjects, levelAssignments)
        // The denominator is the level's subjects, not its assignments —
        // see getLevelKanjiSubjects for why those are different numbers.
        const passed = kanjiPassed(levelAssignments, levelSubjects.length)
        readAt.current = now.getTime()
        // A re-read keeps the last commentary on screen until its own
        // arrives, rather than blanking half the board and redrawing it.
        setBoard(held => ({
          ...held,
          now,
          summary,
          burns: burnsAhead(started, now),
          spread: spread(started),
          moved: moved(started, now),
          learned: learned(started),
          kanji,
          next: nextUp(kanji, now),
          passed
        }))

        later.then(index => {
          if (!live) return
          setBoard(held => ({ ...held, ahead: index ? aheadByLevel(index, started, TOP_LEVEL) : null }))
        })

        extra.then(([index, lists]) => {
          if (!live) return
          setBoard(held => ({
            ...held,
            coverage: index && lists ? { index, taught: taughtKanji(index, started), lists: { JLPT: lists.JLPT, JOYO: lists.JOYO } } : null
          }))
        })

        return commentary.then(async ([statistics, progressions, totals, systems, onLevel, radicals]) => {
          // Every slip, ranked; the lists take the top ten and the field
          // the top sixty. This level's, for the switch — null, and no
          // switch, if the level's assignments did not come.
          const every = statistics ? leeches(statistics, started, Infinity) : null
          const onLevelIds = onLevel ? new Set(onLevel.map(a => a.data.subject_id)) : null
          const everyHere = every && onLevelIds ? every.filter(l => onLevelIds.has(l.subjectId)) : null
          const slipping = every?.slice(0, SLIPPING)
          const slippingHere = everyHere?.slice(0, SLIPPING)
          // Only the handful on screen — never a subject sync. Both lists'
          // at most twenty, read together so the switch never waits. The
          // look-alikes and the field read theirs when their lens opens.
          const ids = [...new Set([...(slipping ?? []), ...(slippingHere ?? [])].map(l => l.subjectId))]
          const leechSubjects = ids.length ? await optional(getSubjects(token, ids)) : null
          if (!live) return
          const shares = statistics
            ? new Map(statistics.filter(st => st?.data).map(st => [st.data.subject_id, st.data.percentage_correct]))
            : null
          const scoped = (list, all) => ({
            items: withPartners(withSubjects(list, leechSubjects), shares),
            field: all.slice(0, FIELD),
            total: all.length
          })
          const srs = systems ? srsSystems(systems) : null
          const radicalItems = radicals ? levelKanji(radicals[0], radicals[1]) : null
          setBoard(held => ({
            ...held,
            totals,
            milestones: milestones(started, now, totals),
            levelUp: srs ? earliestLevelUp(kanji, srs, passed.remaining, now) : null,
            waitingOn: srs ? levelUpKanji(kanji, srs, passed.remaining, now) : [],
            // The level's own system — the accelerated one on levels 1–2.
            fastest: srs ? fastestLevel(srs.get(kanji.find(k => k.system)?.system)) : null,
            accuracy: statistics ? accuracy(statistics) : null,
            slipping: every && {
              all: scoped(slipping, every),
              level: everyHere && scoped(slippingHere, everyHere)
            },
            pace: progressions ? pace(progressions, user.level, now) : null,
            radicals: radicalItems,
            // Without the intervals there is no soonest, but which radical
            // holds which kanji is still WaniKani's to read.
            behind: radicalItems ? lockedBehind(kanji, radicalItems, srs ?? new Map(), now) : null
          }))
        })
      })
      .catch(problem => {
        if (live) setFailure(problem)
      })
      .finally(() => {
        if (live) setBusy(false)
      })

    return () => {
      live = false
    }
  }, [token, user.level, attempt])

  // Ask WaniKani for the user first: a level-up since the last read changes
  // which level's kanji the board should be reading at all.
  function refresh() {
    setBusy(true)
    getUser(token)
      .then(fresh => {
        if (fresh.level !== user.level) onUser(fresh)
        else setAttempt(n => n + 1)
      })
      .catch(problem => {
        setFailure(problem)
        setBusy(false)
      })
  }

  const stale = useRef(refresh)
  stale.current = () => {
    if (!busy && readAt.current && Date.now() - readAt.current > STALE_MS) refresh()
  }

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') stale.current()
    }
    const online = () => stale.current()
    document.addEventListener('visibilitychange', back)
    window.addEventListener('online', online)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('online', online)
    }
  }, [])

  // A failure with a board already drawn is a re-read that did not land:
  // the board stays, and the masthead says the figures are the old ones. Only
  // a 401 — the token itself refused — takes the board away.
  const blocking = failure && (!board || failure.status === 401)

  return (
    <div className="surface-ink board">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="tag">kanigami</span>
        <span className="eyebrow">
          level {user.level} · {user.username}
        </span>
        <span className="sp" />
        {board && !blocking ? (
          <button
            className={failure ? 'quiet hot' : 'quiet'}
            type="button"
            onClick={refresh}
            disabled={busy}
            aria-label={`Figures read at ${clock(board.now)}. Read again.`}
          >
            {busy ? 'reading' : failure ? `not updated · read ${clock(board.now)}` : `read ${clock(board.now)}`}
          </button>
        ) : null}
        <Disconnect onDisconnect={onDisconnect} />
      </header>

      {!online ? (
        <p className="eyebrow hot" role="status">
          offline · this app is online only
        </p>
      ) : null}

      {blocking ? (
        // Only 401 means the token is at fault; anything else gets another
        // go at the same reads rather than an offer to throw the token away.
        <div className="centred">
          <p className="error" role="alert">{failure.message}</p>
          {failure.status === 401 ? (
            <button type="button" onClick={onDisconnect}>Disconnect</button>
          ) : (
            <button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button>
          )}
        </div>
      ) : !board ? (
        <div className="centred">
          <div className="eyebrow hot" role="status">reading your standing</div>
        </div>
      ) : (
        <>
          <Figures board={board} />
          <LevelLine board={board} level={user.level} perLevel={paceFor(board.pace, chosenPace)} />
          {/* The next 24 hours belong with the reviews due they continue —
              they were the footline, 1,400px below the figure. */}
          <Forecast
            summary={board.summary}
            waitingOn={user.level < TOP_LEVEL ? (board.waitingOn ?? []) : []}
            nextLevel={user.level + 1}
          />
          <div className="columns">
            <div className="column">
              <Level key={user.level} board={board} level={user.level} token={token} />
            </div>
            <div className="column">
              <Srs spread={board.spread} moved={board.moved} />
              <Milestones milestones={board.milestones} burns={board.burns} now={board.now} />
            </div>
            <div className="column">
              <Slipping slipping={board.slipping} level={user.level} now={board.now} readSubjects={ids => getSubjects(token, ids)} />
            </div>
          </div>
          <Ahead
            pace={board.pace}
            level={user.level}
            now={board.now}
            soonest={board.levelUp?.at ?? null}
            fastest={board.fastest ?? null}
            perLevel={paceFor(board.pace, chosenPace)}
            onPace={setChosenPace}
            learned={board.learned}
            totals={board.totals}
            later={board.ahead}
            milestones={board.milestones}
            coverage={board.coverage}
          />
        </>
      )}

      {board && !blocking ? null : (
        <div className="footline">
          <span>読み書き</span>
          <span className="track" />
          <span>online only</span>
        </div>
      )}
    </div>
  )
}

// One stray tap on a tablet should not throw the token away, so the door
// asks in place: the first press arms it for a few seconds, the second goes.
// No dialog — the word itself changes.
const ARMED_MS = 4000

function Disconnect({ onDisconnect }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const calm = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(calm)
  }, [armed])

  return (
    <button
      className={armed ? 'quiet hot' : 'quiet'}
      type="button"
      onClick={() => (armed ? onDisconnect() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? 'Confirm disconnect' : 'Disconnect'}
    </button>
  )
}

// Attach the fetched subject to each slipping item. One that did not come
// back (the read failed, or the subject vanished) is dropped rather than
// drawn as a percentage with no character.
function withSubjects(slipping, subjects) {
  if (!subjects) return []
  const byId = new Map(subjects.map(s => [s.id, s]))
  return slipping.filter(l => byId.has(l.subjectId)).map(l => ({ ...l, subject: byId.get(l.subjectId) }))
}

// The look-alike lens's partner for each, with its share right — null for
// one not yet reviewed. Read off the subjects already fetched and the
// statistics already loaded; only the partner's own subject waits for the
// lens to open.
function withPartners(items, shares) {
  if (!shares) return items
  return items.map(l => {
    const partner = partnerFor(l.type, l.subject.data, shares)
    return partner ? { ...l, partner: { ...partner, percentage: shares.get(partner.id) ?? null } } : l
  })
}

const TOP_LEVEL = 60

// How many kanji the next-up line names before it counts them instead.
const NAMED = 4

// A section's hairline heading: what it is on the left, its one number on
// the right. Not a box — the rule is the only thing drawn.
function Head({ children, right }) {
  return (
    <div className="head">
      <h2>{children}</h2>
      {right ? <span>{right}</span> : null}
    </div>
  )
}

// A count of nothing is dim. Only reviews take the accent, and only when
// there are some.
//
// The kanji to the next level was a figure here; it is the level line's
// sentence now, beside the rest of what the level says. The seven days'
// total went at the owner's word — the 24 hours under it say what is
// coming, and a week's sum asked nothing of anyone.
function Figures({ board }) {
  const reviews = dueNow(board.summary)
  const lessons = lessonsWaiting(board.summary)

  return (
    <div className="figures">
      <div className={reviews > 0 ? 'figure due' : 'figure none'}>
        <b>{reviews}</b>
        <span>reviews due</span>
      </div>
      <div className={lessons > 0 ? 'figure' : 'figure none'}>
        <b>{lessons}</b>
        <span>lessons waiting</span>
      </div>
      {board.accuracy ? (
        <div className="figure soft">
          <b>
            {percent(board.accuracy.meaning)}
            <small> / {percent(board.accuracy.reading)}</small>
          </b>
          <span>meaning / reading %</span>
        </div>
      ) : null}
    </div>
  )
}

// 段 The level line — where the level stands, straight under the figures,
// the board's second band. Decided from a prototype (PLAN.md, "The level
// line"): of four places — a band, the figure growing its lines, a road of
// soonest passes, a pinned masthead line — the band.
//
// One sentence says it, the kanji to the next level leading. Beneath, a
// hairline of the level's every kanji in the grid's order — passed, then
// apprentice by stage, then lessons, then locked — with a mark where the
// 90% WaniKani levels you up at falls, and the counts by state. Then three
// reads: what is next, the level-up, and the next level at the dial's pace.
//
// Every state is WaniKani's, read off an assignment. The earliest level-up
// runs WaniKani's own intervals and the date runs the dial; both are
// projections, and the line beneath says so.
const STATES = [
  ['passed', 'passed'],
  ['apprentice', 'apprentice'],
  ['lesson', 'in lessons'],
  ['locked', 'locked']
]

function LevelLine({ board, level, perLevel }) {
  const { passed, needed, remaining, total } = board.passed
  const kanji = board.kanji
  const tally = Object.fromEntries(STATES.map(([state]) => [state, kanji.filter(k => k.state === state).length]))
  const p = board.pace
  const onLevel = p?.current?.days
  const day = onLevel !== undefined ? Math.floor(onLevel) + 1 : null
  const usual = p?.median != null ? Math.round(p.median) : null
  const top = level >= TOP_LEVEL
  const levelUp = board.levelUp
  // The level's radicals that have not passed: what the locked kanji wait on.
  const radicalsShort = Array.isArray(board.radicals) ? board.radicals.filter(r => r.state !== 'passed').length : null
  const ahead = !top && perLevel !== null && p ? project(p, level, perLevel, board.now, levelUp?.at ?? null) : null

  const where = [`Level ${level}`, day !== null ? `day ${day}${usual && !top ? ` of your usual ${usual}` : ''}` : null]
    .filter(Boolean)
    .join(' · ')
  let say
  if (top) say = `${passed} of ${total} kanji passed`
  else if (total === 0) say = 'no kanji at this level yet'
  else if (remaining === 0) say = `ready for level ${level + 1}`
  else {
    say = `${remaining} kanji to level ${level + 1}`
    // The soonest when there is one; when it hangs on locked kanji, those.
    if (levelUp?.at) say += `, the soonest ${when(levelUp.at)}`
    else if (tally.locked > 0) say += `, ${tally.locked} of the level’s still locked`
  }

  const next = board.next
  let up = null
  if (top || total === 0) up = null
  else if (remaining === 0) up = 'Ready — WaniKani levels you up on its next look'
  else if (levelUp === undefined) up = 'Reading…'
  else if (levelUp?.waitsOnLocked) {
    up = `Waits on ${many(tally.locked)} locked kanji`
    if (radicalsShort) up += ` · ${radicalsShort} of the level’s radicals not passed yet`
  } else if (levelUp?.at) up = `Earliest ${when(levelUp.at)}`

  return (
    <section className="level-line">
      <div className="head">
        <h2>level {level}</h2>
        {total > 0 ? <span>{top ? `${passed} of ${total} passed` : `${passed} of ${needed} needed`}</span> : null}
      </div>
      <p className="say">
        <span className="soft">{where} ·</span> {say}
      </p>
      {total > 0 ? (
        <>
          <div className="states" aria-hidden="true">
            {kanji.map(k => (
              <i key={k.id} className={k.state === 'apprentice' && k.stage === 4 ? 'apprentice four' : k.state} />
            ))}
            {!top ? (
              <span className="need" style={{ left: `${(needed / total) * 100}%` }}>
                {needed} needed
              </span>
            ) : null}
          </div>
          <p className="tally">
            {STATES.filter(([state]) => tally[state] > 0).map(([state, word]) => (
              <span key={state}>
                <i className={state} aria-hidden="true" />
                {many(tally[state])} {word}
              </span>
            ))}
          </p>
        </>
      ) : null}
      <div className="reads">
        {next ? (
          <div>
            <span className="what">next</span>
            <span>
              {/* A handful reads as characters; a batch of a dozen from one
                  lesson session is a wall of them, and the count says more. */}
              <span className="glyphs">
                {next.kanji.length <= NAMED ? next.kanji.map(k => k.characters).join(' ') : `${next.kanji.length} kanji`}
              </span>{' '}
              {next.at ? `up at ${clock(next.at)}` : 'due now'}
              {next.oneStep ? ', one step from passing' : ''}
            </span>
          </div>
        ) : null}
        {up ? (
          <div>
            <span className="what">level-up</span>
            <span>{up}</span>
          </div>
        ) : null}
        {ahead ? (
          <div>
            <span className="what">at your pace</span>
            <span>
              Level {level + 1} ≈ {dayMonth(ahead.startOf(level + 1))}, {dayCount(perLevel)} days a level
            </span>
          </div>
        ) : null}
      </div>
      <Behind behind={board.behind} />
      {levelUp?.at || ahead || board.behind?.blockers.some(b => b.at) ? (
        <p className="notes">
          <span className="proj">
            {[
              levelUp?.at || board.behind?.blockers.some(b => b.at) ? 'Soonest and earliest assume every answer is right' : null,
              ahead ? '≈ at the dial’s pace' : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
      ) : null}
    </section>
  )
}

// What keeps the locked kanji locked: one row per radical of the level not
// yet passed — the radical, where it stands and the soonest it could pass —
// and the locked kanji it holds. A kanji with two radicals left sits on both
// rows; WaniKani unlocks it when the last one passes. Hidden when nothing on
// the level is locked.
function Behind({ behind }) {
  if (!behind || (behind.blockers.length === 0 && behind.others.length === 0)) return null
  const glyph = item => item.characters ?? (item.image ? <img src={item.image} alt="" /> : '〓')

  return (
    <div className="behind">
      <span className="what">locked behind</span>
      <ul>
        {behind.blockers.map(({ radical: r, holds, at }) => (
          <li key={r.id}>
            <span className="radical" aria-hidden="true">
              {glyph(r)}
            </span>
            <span className="about">
              <span className="name">{r.meaning}</span>
              <span className="soft">
                {r.state === 'lesson' ? 'in lessons' : stageName(r.stage)}
                {at ? ` · passes ${when(at)} at the soonest` : ''}
              </span>
            </span>
            <span className="holds">
              <span className="say-holds">holds </span>
              {holds.map(k => (
                <span key={k.id} className="kanji-held">
                  {glyph(k)}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {behind.others.length > 0 ? (
        <p className="notes">
          <span className="soft">
            <span className="glyphs">{behind.others.map(k => k.characters).join(' ')}</span>{' '}
            {behind.others.length === 1 ? 'waits' : 'wait'} on a radical from another level
          </span>
        </p>
      ) : null}
    </div>
  )
}

function percent(fraction) {
  return fraction === null ? '–' : Math.round(fraction * 100)
}

// Every kanji of the level, locked ones included, so the level's size is
// on screen rather than implied. Brightness says where each stands; the
// hairline beneath says it again for anyone not reading brightness —
// apprentice as four pips lit to its stage, passed as one guru-coloured
// rule. Each cell's label carries all of it in words.
//
// **Pointing at a character re-points the notes** to it — what it is, its
// stage, and when WaniKani next asks for it — the way the pace caption and
// the forecast footline do: no tooltip, the line of type already there says
// something more specific. The arrows walk the grid from the keyboard. The
// usual notes keep their room underneath, so the section never changes
// height under the cursor.
//
// How far is the figure's job, so the notes do not say `8 to level 16`
// again; they say how long, what is next, and the soonest it could end.
//
// **The heading switches the grid between the level's kanji, its radicals
// and its vocabulary** — words beside `level 16`, the chosen one lit —
// rather than a fold under the kanji, which read as one more section head.
// The radicals and the vocabulary are each read the first time they are
// asked for. Words are as long as they are, so they flow rather than sit in
// the kanji's eight columns, a step down from the kanji's size.
const KINDS = ['kanji', 'radicals', 'vocab']
const OTHERS = {
  radicals: { read: getLevelRadicals, noun: 'radicals', one: 'a radical' },
  vocab: { read: getLevelVocabulary, noun: 'vocabulary', one: 'a word' }
}

function Level({ board, level, token }) {
  const [reading, setReading] = useState(null)
  const [showing, setShowing] = useState('kanji')
  // Per kind: null until asked for, then 'reading', 'failed' or the items.
  const [others, setOthers] = useState({ radicals: null, vocab: null })

  function readOther(kind) {
    setOthers(o => ({ ...o, [kind]: 'reading' }))
    OTHERS[kind]
      .read(token, level)
      .then(([subjects, assignments]) => setOthers(o => ({ ...o, [kind]: levelKanji(subjects, assignments) })))
      .catch(() => setOthers(o => ({ ...o, [kind]: 'failed' })))
  }

  function show(kind) {
    setShowing(kind)
    setReading(null)
    if (kind === 'radicals' && Array.isArray(board.radicals)) return
    if (OTHERS[kind] && (others[kind] === null || others[kind] === 'failed')) readOther(kind)
  }

  const other = OTHERS[showing]
  // The radicals come with the board's commentary now; asked for before it
  // lands, or if it failed, they are read as before.
  const held = showing === 'radicals' && Array.isArray(board.radicals) ? board.radicals : others[showing]
  const items = other ? held : board.kanji
  const otherPassed = other && Array.isArray(items) ? items.filter(r => r.state === 'passed').length : null
  // The kanji's count, the day, what is next and the level-up are the level
  // line's now, at the top of the board. Radicals and vocabulary have no
  // threshold and no line of their own, so their count stays here.
  const count = other && otherPassed !== null ? `${otherPassed} of ${items.length} passed` : null

  // On a tablet the notes stand beside the grid rather than under it (see
  // `.level` in index.css), so the level is half as tall.
  return (
    <section className="level">
      <div className="head">
        <h2>
          level {level}
          <span className="kinds" role="group" aria-label={`Show level ${level}'s`}>
            {KINDS.map(kind => (
              <button key={kind} type="button" aria-pressed={showing === kind} onClick={() => show(kind)}>
                {kind}
              </button>
            ))}
          </span>
        </h2>
      </div>
      <div className="body">
        {!other ? (
          <Grid items={board.kanji} label={`Level ${level} kanji`} onRead={setReading} />
        ) : items === null || items === 'reading' ? (
          <p className="notes" role="status">
            <span className="hint">Reading {other.noun}…</span>
          </p>
        ) : items === 'failed' ? (
          <p className="notes row hot" role="alert">
            <span>The {other.noun} did not load</span>
            <button className="quiet" type="button" onClick={() => readOther(showing)}>
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="notes">No {other.noun} at this level</p>
        ) : (
          <Grid
            items={items}
            label={`Level ${level} ${other.noun}`}
            onRead={setReading}
            words={showing === 'vocab'}
          />
        )}
      </div>
      <p className="notes readout" aria-live="polite">
        <span className={reading ? 'usual hidden' : 'usual'}>
          {count ? <span className="soft">{count}</span> : null}
          <Hint pointer="Point at" touch="Tap">
            {other ? other.one : 'a kanji'} for its next review,{' '}
            <span className="by-pointer">click</span>
            <span className="by-touch">again</span> for its WaniKani page
          </Hint>
        </span>
        {reading ? (
          <span className="usual">
            <span className="soft">
              {reading.characters ?? ''} {reading.meaning} · {describe(reading)}
            </span>
            <span className="soft">{nextReview(reading, new Date())}</span>
          </span>
        ) : null}
      </p>
    </section>
  )
}

// One grid of the level's subjects — kanji, radicals or words. `onRead` hears the
// item under the pointer or the keyboard, and null when both leave.
//
// Each cell links out to its WaniKani page. A mouse clicks through, since
// it reads by hovering; **a finger's first tap reads and its second opens**,
// so tapping for the next review never leaves the board. Enter opens the
// cell the arrows are on. The links stay out of the tab order, which the
// grid already walks as one stop.
//
// `words` lets the cells run as wide as their word, so a row holds as many
// as fit; up and down then go to the word nearest above or below.
const ACROSS = 8

function Grid({ items, label, onRead, words = false }) {
  const { at, point, groupProps, itemProps } = usePointing(i => onRead(i === null ? null : items[i]))
  const opens = useRef(true)

  function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ACROSS, ArrowDown: ACROSS }[event.key]
    if (step) {
      event.preventDefault()
      if (at === null) point(0)
      else if (words && Math.abs(step) === ACROSS) point(below(event.currentTarget, at, Math.sign(step)) ?? at)
      else point(Math.min(items.length - 1, Math.max(0, at + step)))
    }
    if (event.key === 'Escape') point(null)
    if (event.key === 'Enter' && items[at]?.url) window.open(items[at].url, '_blank', 'noreferrer')
  }

  return (
    // A list, so browse mode can walk it a cell at a time; each cell's words
    // are text inside it rather than an aria-label, which a plain list item
    // is not reliably read by. `role="list"` because Safari drops the list
    // role from a list styled without bullets.
    <ul
      className={words ? 'kanji words' : 'kanji'}
      role="list"
      aria-label={label}
      onKeyDown={key}
      {...groupProps}
    >
      {items.map((k, i) => (
        <li key={k.id} className={[k.state, at === i ? 'reading' : ''].join(' ').trim()} {...itemProps(i)}>
          <a
            className="open"
            href={k.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            tabIndex={-1}
            onPointerDown={event => {
              opens.current = event.pointerType === 'mouse' || at === i
            }}
            onClick={event => {
              if (!opens.current) event.preventDefault()
              // A click with no press before it — a screen reader's — opens.
              opens.current = true
            }}
          >
            <span className="sr-only">
              {`${k.characters ?? ''} ${k.meaning}: ${describe(k)}, ${nextReview(k, new Date())}`}
            </span>
            <span className="character" aria-hidden="true">
              {k.characters ?? (k.image ? <img src={k.image} alt="" /> : '〓')}
            </span>
            {k.state === 'apprentice' ? (
              <span className="pips" aria-hidden="true">
                {[1, 2, 3, 4].map(n => (
                  <i key={n} className={n <= k.stage ? 'lit' : ''} />
                ))}
              </span>
            ) : (
              <span className="underline" aria-hidden="true" />
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}

// In a flowing list, the cell on the next row up (`way` -1) or down (+1)
// whose centre sits nearest the one at `at`; null at the edge.
function below(list, at, way) {
  const cells = [...(list?.children ?? [])].map(el => el.getBoundingClientRect())
  const from = cells[at]
  if (!from) return null
  const rows = cells.map(r => r.top).filter(top => (top - from.top) * way > 1)
  if (rows.length === 0) return null
  const row = way > 0 ? Math.min(...rows) : Math.max(...rows)
  const centre = r => r.left + r.width / 2
  let best = null
  cells.forEach((r, i) => {
    if (Math.abs(r.top - row) > 1) return
    if (best === null || Math.abs(centre(r) - centre(from)) < Math.abs(centre(cells[best]) - centre(from))) best = i
  })
  return best
}

// When WaniKani next asks for it, read off the assignment — never worked out.
function nextReview(k, now) {
  if (k.state === 'locked') return 'Not unlocked yet'
  if (k.state === 'lesson') return 'Lesson first'
  if (k.stage === 9) return 'Never again'
  if (!k.availableAt) return 'No review scheduled'
  const at = new Date(k.availableAt)
  if (at <= now) return 'Review due now'
  return `Next review ${when(at)}`
}

function describe(k) {
  if (k.state === 'locked') return 'locked'
  if (k.state === 'lesson') return 'waiting in lessons'
  if (k.state === 'passed') return `passed, ${stageName(k.stage)}`
  return stageName(k.stage)
}

function Srs({ spread: bands, moved: gained }) {
  return (
    <section>
      <Head>srs spread</Head>
      <Spread spread={bands} />
      <p className="notes row moves">
        {/* Only the moves WaniKani dates — see `moved` for why master and
            enlightened cannot be here. */}
        {/* `+27 apprentice` read as the apprentice count going up by that;
            it is lessons started, and the guru and burned counts are first
            arrivals. Past, so it says past. */}
        <span className="soft">Past 7 days</span>
        {/* Lessons done are progress, so neutral ink — in apprentice's red
            they read as a warning about something done right. Guru and
            burned keep their band colours, which mean nothing urgent. */}
        <span className="soft">{many(gained.apprentice)} taught</span>
        <span className="srs-guru">{many(gained.guru)} to guru</span>
        <span className="srs-burned">{many(gained.burned)} burned</span>
      </p>
    </section>
  )
}

// The switch reads every level's slips or only this one's — the same ten
// worst, narrowed to what the current level holds. Every level's is first:
// it is the lifetime record, and a level's items are new enough that few of
// them have been missed the three times it takes to count.
//
// Under it, the lenses: five ways to look at the same slips, one at a
// time (picked from a prototype; PLAN.md, "Lenses"). Worst is the ranked
// list; next orders it by when WaniKani asks for each; how groups it by
// streak; alike puts each beside the kanji it is taken for; field plots
// every slip, not just ten. Never saved — the board opens on worst.
const LENSES = ['worst', 'next', 'how', 'alike', 'field']

function Slipping({ slipping, level, now, readSubjects }) {
  const [scope, setScope] = useState('all')
  const [lens, setLens] = useState('worst')
  // Subjects the alike and field lenses read when they open, by id: the
  // partners' and the field's, kept across switches so each is read once.
  const [extra, setExtra] = useState(() => new Map())
  const [reading, setReading] = useState(null)

  const onLevel = scope === 'level' && slipping?.level
  const shown = slipping ? (onLevel ? slipping.level : slipping.all) : null

  const wanted =
    !shown || (lens !== 'alike' && lens !== 'field')
      ? []
      : (lens === 'alike' ? shown.items.map(l => l.partner?.id) : shown.field.map(l => l.subjectId)).filter(
          id => id && !extra.has(id) && !shown.items.some(l => l.subjectId === id)
        )
  const key = wanted.join(',')

  useEffect(() => {
    if (!key) return
    let live = true
    setReading('reading')
    readSubjects(key.split(',').map(Number))
      .then(subjects => {
        if (!live) return
        // An id WaniKani does not return is kept as null, so it is asked
        // for once rather than waited on for ever.
        const ids = key.split(',').map(Number)
        setExtra(held => new Map([...held, ...ids.map(id => [id, null]), ...subjects.map(s => [s.id, s])]))
        setReading(null)
      })
      .catch(() => live && setReading('failed'))
    return () => {
      live = false
    }
    // Keyed on the ids alone: readSubjects is a fresh arrow every render.
  }, [key])

  if (slipping === undefined) return <Waiting title="keeps slipping" />
  if (!slipping) return null

  const scopes = [['all', 'all levels'], ['level', `level ${level}`]]
  const items = shown.items
  const subjectOf = id => items.find(l => l.subjectId === id)?.subject ?? extra.get(id) ?? null

  return (
    <section>
      <Head right={lens === 'field' && shown.total ? fieldCount(shown) : null}>keeps slipping</Head>
      {slipping.level ? (
        <div className="switch" role="group" aria-label="Show what keeps slipping on">
          {scopes.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={k === (onLevel ? 'level' : 'all')} onClick={() => setScope(k)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="notes">
          {onLevel ? `Nothing on level ${level} missed often enough to count` : 'Nothing missed often enough to count'}
        </p>
      ) : (
        <>
          <div className="lenses" role="group" aria-label="Look at them by">
            {LENSES.map(k => (
              <button key={k} type="button" aria-pressed={k === lens} onClick={() => setLens(k)}>
                {k}
              </button>
            ))}
          </div>
          {lens === 'alike' || lens === 'field' ? (
            reading === 'failed' && wanted.length ? (
              <p className="notes">
                <span className="hint">Couldn’t read them from WaniKani</span>
              </p>
            ) : wanted.length ? (
              <p className="notes">
                <span className="hint">Reading…</span>
              </p>
            ) : lens === 'alike' ? (
              <Alike items={items} subjectOf={subjectOf} />
            ) : (
              <Field key={onLevel ? 'level' : 'all'} items={shown.field} subjectOf={subjectOf} />
            )
          ) : (
            <SlipList key={`${lens}-${onLevel ? 'level' : 'all'}`} {...lensed(lens, items, now)} />
          )}
        </>
      )}
    </section>
  )
}

function fieldCount({ field, total }) {
  return total > field.length ? `worst ${field.length} of ${many(total)}` : `${many(total)} in all`
}

// What each list lens shows: the rows in their order, with group labels
// where it groups, what the row ends with, and what the readout adds.
function lensed(lens, items, now) {
  const share = l => `${l.percentage}%`
  if (lens === 'next') {
    const order = [...items].sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity))
    const groups = [
      ['due now', l => l.due && Date.parse(l.due) <= now.getTime()],
      ['next 6 hours', l => l.due && Date.parse(l.due) <= now.getTime() + 6 * HOUR_MS],
      ['later today', l => l.due && new Date(l.due).toDateString() === now.toDateString()],
      ['later', () => true]
    ]
    return {
      groups: grouped(order, groups),
      end: l => [<span key="d" className={dueIn(l, now) === 'now' ? 'due now' : 'due'}>{dueIn(l, now)}</span>, ` · ${share(l)}`],
      say: l => `${slipLine(l)} · ${l.stage === null ? 'no assignment' : stageName(l.stage)}, ${dueIn(l, now) === 'now' ? 'due now' : `next up ${dueIn(l, now)}`}`,
      hint: 'one for its stage and when it is next up'
    }
  }
  if (lens === 'how') {
    const groups = [
      ['fell back', l => l.kind === 'fell'],
      ['never stuck', l => l.kind === 'never'],
      ['mending', l => l.kind === 'mending']
    ]
    return {
      groups: grouped(items, groups),
      end: l => [<Streak key="s" streak={l.streak} />, ` ${share(l)}`],
      say: l => `${slipLine(l)} · ${l.streak.half} streak ${l.streak.current}, best ${l.streak.best}`,
      hint: 'one for its streak — fell back held once, never stuck never has, mending is on its way out'
    }
  }
  return {
    groups: [{ label: null, items }],
    end: l => [
      // The half it is missed on — what to drill — as its initial, so the
      // row stays one line. Said in full to a screen reader.
      l.weak ? (
        <span key="w" className="weak">
          <span aria-hidden="true">{l.weak.half[0]} </span>
          <span className="sr-only">
            {l.weak.half} {l.weak.percentage}%,{' '}
          </span>
        </span>
      ) : null,
      share(l)
    ],
    say: slipLine,
    hint: 'one for how it is missed'
  }
}

const HOUR_MS = 60 * 60 * 1000

// Each item into the first group that takes it, empty groups dropped.
function grouped(items, groups) {
  let left = items
  const out = []
  for (const [label, takes] of groups) {
    const taken = left.filter(takes)
    left = left.filter(l => !taken.includes(l))
    if (taken.length) out.push({ label, items: taken })
  }
  return out
}

// When WaniKani next asks: now, the hour today, the weekday and hour this
// week, the date after that.
function dueIn(l, now) {
  if (!l.due) return '—'
  const at = new Date(l.due)
  if (at <= now) return 'now'
  if (at.toDateString() === now.toDateString()) return clock(at)
  if (at - now < 6 * 24 * HOUR_MS) return `${weekday(at)} ${clock(at)}`
  return dayMonth(at)
}

// The weak half's current run lit, the rest of its best run in the rule,
// and a mark on the floor when the last answer was a miss.
function Streak({ streak }) {
  const cells = Math.min(streak.best, 8)
  return (
    <span className="streak" aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < streak.current ? 'on' : undefined} />
      ))}
      {streak.current === 1 ? <i className="miss" /> : null}
    </span>
  )
}

// One line a row — character, meaning, reading, and what the lens ends it
// with — so ten fit where five used to (picked from a prototype; see
// PLAN.md). What the line leaves out is in the readout under it: point at a
// row, or tap it, or arrow to it. Like the level grid, a mouse clicks the
// character through to WaniKani, and a finger's first tap reads and its
// second opens. Group labels sit between rows and are not pointed at.
function SlipList({ groups, end, say, hint }) {
  const items = groups.flatMap(g => g.items)
  const { at, point, groupProps, itemProps } = usePointing()
  const opens = useRef(true)
  const read = at === null ? null : items[at]

  function key(event) {
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]
    if (step) {
      event.preventDefault()
      point(at === null ? 0 : Math.min(items.length - 1, Math.max(0, at + step)))
    }
    if (event.key === 'Escape') point(null)
    const page = read && pageFor(read.subject.data)
    if (event.key === 'Enter' && page) window.open(page, '_blank', 'noreferrer')
  }

  // Rows and group labels in one run, each row with its place among the
  // pointable items.
  const rows = []
  let index = 0
  for (const group of groups) {
    if (group.label) rows.push({ label: group.label, count: group.items.length })
    for (const l of group.items) rows.push({ l, index: index++ })
  }

  return (
    <>
      <ul className="slipping" role="list" aria-label="What keeps slipping" onKeyDown={key} {...groupProps}>
        {rows.map(({ label, count, l, index }) => {
          if (label) {
            return (
              <li key={label} className="group" aria-hidden="true">
                <span>{label}</span>
                <span>{count}</span>
              </li>
            )
          }
          const { text, image } = glyphFor(l.subject.data)
          const page = pageFor(l.subject.data)
          const reading = readingOf(l.subject.data)
          const glyph = text ?? (image ? <img src={image} alt="" /> : '〓')
          return (
            <li key={l.subjectId} className={at === index ? 'read' : undefined} {...itemProps(index)}>
              {/* Out to WaniKani's page for it, where the mnemonic is. */}
              {page ? (
                <a
                  className="character"
                  href={page}
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={-1}
                  onPointerDown={event => {
                    opens.current = event.pointerType === 'mouse' || at === index
                  }}
                  onClick={event => {
                    if (!opens.current) event.preventDefault()
                    opens.current = true
                  }}
                >
                  {glyph}
                </a>
              ) : (
                <span className="character">{glyph}</span>
              )}
              <span className="what">
                <span className={`meaning wk-${l.type}`}>{meaningOf(l.subject.data)}</span>
                {reading ? <span className="reading">{reading}</span> : null}
              </span>
              <span className="count">{end(l)}</span>
            </li>
          )
        })}
      </ul>
      <p className="notes readout" aria-live="polite">
        <span className={read ? 'usual hidden' : 'usual'}>
          <Hint pointer="Point at" touch="Tap">
            {hint}, <span className="by-pointer">click</span>
            <span className="by-touch">again</span> for its WaniKani page
          </Hint>
        </span>
        {read ? (
          <span className="usual">
            <span className="soft">{say(read)}</span>
          </span>
        ) : null}
      </p>
    </>
  )
}

// Each slip beside the kanji it is most likely taken for, or a word beside
// the kanji in it that is pulling it down (`partnerFor`). A pair whose two
// halves are both in the list shows once. Six at most: a pair is three
// lines, and ten of them would run past the other columns.
const PAIRS = 6

function Alike({ items, subjectOf }) {
  const listed = new Set(items.map(l => l.subjectId))
  const seen = new Set()
  const pairs = []
  for (const l of items) {
    if (!l.partner || seen.has(l.subjectId) || pairs.length >= PAIRS) continue
    const other = subjectOf(l.partner.id)
    if (!other) continue
    seen.add(l.subjectId)
    seen.add(l.partner.id)
    pairs.push({ l, other, both: listed.has(l.partner.id) })
  }
  if (!pairs.length) return <p className="notes">Nothing here has a look-alike WaniKani names</p>

  return (
    <ul className="pairs">
      {pairs.map(({ l, other, both }) => {
        const { relation, percentage } = l.partner
        const word = relation === 'part'
        return (
          <li key={l.subjectId} className={word ? 'pair word' : 'pair'}>
            <Side subject={l.subject.data} type={l.type} percentage={l.percentage} />
            <span className="vs">{word ? 'has' : 'vs'}</span>
            <Side subject={other.data} type="kanji" percentage={percentage} far />
            <span className="note">
              {word
                ? `Missed on the ${l.weak?.half ?? 'meaning'}; ${other.data.characters} is the weakest kanji in it`
                : both
                  ? 'Both slipping — learn them as a pair'
                  : percentage === null
                    ? `${other.data.characters} is still ahead of you`
                    : `${other.data.characters} sticks; ${glyphFor(l.subject.data).text ?? 'this'} is the one to fix`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Side({ subject, type, percentage, far = false }) {
  const page = pageFor(subject)
  const { text, image } = glyphFor(subject)
  const glyph = text ?? (image ? <img src={image} alt="" /> : '〓')
  return (
    <span className={far ? 'side far' : 'side'}>
      {page ? (
        <a className="character" href={page} target="_blank" rel="noreferrer">
          {glyph}
        </a>
      ) : (
        <span className="character">{glyph}</span>
      )}
      <span className={`meaning wk-${type}`}>{meaningOf(subject)}</span>
      <span className="count">{percentage === null ? 'not reviewed yet' : `${percentage}% right`}</span>
    </span>
  )
}

// Every slip, not just ten: misses across, share right up. Bottom right is
// chronic — missed often and still under. The scales run to the slips on
// screen, so a field of near misses does not sit in one corner, and misses
// run on a log scale: one item missed hundreds of times would otherwise
// press every other into the first few pixels. Marks sit inside the axes,
// never on them.
function Field({ items, subjectOf }) {
  const placed = items.filter(l => subjectOf(l.subjectId))
  const { at, groupProps, itemProps } = usePointing()
  const read = at === null ? null : placed[at]
  if (!placed.length) return null

  const most = Math.max(...placed.map(l => l.misses))
  const least = Math.min(...placed.map(l => l.percentage))
  const floor = Math.min(90, Math.floor(least / 10) * 10)
  const inset = x => 5 + x * 0.9
  const across = m => inset((Math.log(m / MIN_MISSES) / Math.max(Math.log(most / MIN_MISSES), Math.log(2))) * 100)
  const up = p => inset(100 - ((p - floor) / (100 - floor)) * 100)

  return (
    <>
      <div className="field" role="list" aria-label="Every slip, by misses and share right" {...groupProps}>
        <span className="tick up" style={{ top: `${up(100)}%` }}>100%</span>
        <span className="tick up" style={{ top: `${up(floor)}%` }}>{floor}%</span>
        <span className="tick across" style={{ left: `${across(MIN_MISSES)}%` }}>{MIN_MISSES}</span>
        <span className="tick across end">{many(most)} missed</span>
        {placed.map((l, i) => {
          const data = subjectOf(l.subjectId).data
          const { text, image } = glyphFor(data)
          return (
            <span
              key={l.subjectId}
              role="listitem"
              className={['glyph', `wk-${l.type}`, (text?.length ?? 1) > 2 ? 'long' : '', at === i ? 'read' : ''].join(' ').trim()}
              // Anchored as far along itself as it is along the axis, so a
              // long word at either end stays inside.
              style={{
                left: `${across(l.misses)}%`,
                top: `${up(l.percentage)}%`,
                transform: `translate(-${across(l.misses)}%, -50%)`
              }}
              {...itemProps(i)}
            >
              <span className="sr-only">{slipLine({ ...l, subject: { data } })}</span>
              <span aria-hidden="true">{text ?? (image ? <img src={image} alt="" /> : '〓')}</span>
            </span>
          )
        })}
      </div>
      <p className="notes readout" aria-live="polite">
        <span className={read ? 'usual hidden' : 'usual'}>
          <Hint pointer="Point at" touch="Tap">
            one for how it is missed — bottom right is missed most and right least
          </Hint>
        </span>
        {read ? (
          <span className="usual">
            <span className="soft">{slipLine({ ...read, subject: subjectOf(read.subjectId) })}</span>
          </span>
        ) : null}
      </p>
    </>
  )
}

const meaningOf = data => data.meanings?.find(m => m.primary)?.meaning
const readingOf = data => data.readings?.find(r => r.primary)?.reading

// 一応 Just in case, いちおう · missed 9 times · meaning 60%, reading 73%
// right. The halves WaniKani has never asked — a radical's reading — are
// left out rather than shown as nothing.
function slipLine(l) {
  const { data } = l.subject
  const name = [glyphFor(data).text, meaningOf(data)].filter(Boolean).join(' ')
  const reading = readingOf(data)
  const shares = ['meaning', 'reading']
    .filter(h => l.halves?.[h] != null)
    .map(h => `${h} ${l.halves[h]}%`)
  return [
    reading ? `${name}, ${reading}` : name,
    `missed ${l.misses} ${l.misses === 1 ? 'time' : 'times'}`,
    shares.length ? `${shares.join(', ')} right` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

// 歩 Ahead — the pace dial, then taught and coverage side by side under one
// "through level" slider: everything on the board that the dial's pace
// moves, in one band. Decided from a prototype (the dial, PLAN.md) and
// regrouped after a design review (PLAN.md, "The regrouping"), which found
// projections scattered over five places and the road repeating the dial's
// decade marks 400px below them. The milestones went back to column two
// when the slider took taught along: they keep their own clock.
//
// The dial starts at the median and is never saved: the board opens on
// your own pace every time, and the dial is for asking "and if faster?".
// Its pace runs the decade dates, level 60 and coverage's dates. The
// milestones keep their own clock — the last 30 days' rate of lessons and
// burns — and say so, because a level pace says nothing about burns.
//
// Everything it moves is a projection and says so. The past is read; the
// future is `project` at the dial's pace, held back by the earliest
// level-up, and the dial cannot go below the fastest level WaniKani's own
// intervals allow.
const STEP = 0.5
const toStep = days => Math.round(days / STEP) * STEP
const dayCount = days => (days % 1 ? days.toFixed(1) : String(days))

// Levels 1–2 run WaniKani's accelerated system, so the quickest level is
// nearly always one of them — WaniKani's speed, not yours. Your fastest is
// picked from the levels after.
const ACCELERATED = 2

// The dial's pace: what it was set to, or the median rounded to its step.
function paceFor(p, chosen) {
  if (chosen !== null) return chosen
  return p?.median != null ? toStep(p.median) : null
}

function Ahead({ pace: p, level, now, soonest, fastest, perLevel, onPace, learned: counts, totals, later, milestones: m, coverage: c }) {
  const [through, setThrough] = useState(null)
  // Only a level ahead is a projection; the slider at its start is now. It
  // needs the kanji index, so it waits for coverage's read.
  const at = c && through !== null && through > level ? through : null
  const gains = {
    radical: at && later ? later.radical[at] : 0,
    kanji: at ? throughLevel(c.index, c.taught, at).size - c.taught.size : 0,
    vocabulary: at && later ? later.vocabulary[at] : 0
  }

  return (
    <div className="forward">
      <PaceDial
        pace={p}
        level={level}
        now={now}
        soonest={soonest}
        fastest={fastest}
        perLevel={perLevel}
        onPace={onPace}
        through={at}
      />
      <div className="through">
        <div className="pair">
          <Taught learned={counts} totals={totals} next={m?.next} at={at} gains={gains} counted={Boolean(later)} />
          <Coverage coverage={c} at={at} />
        </div>
        {c ? (
          <Through level={level} at={at} onThrough={setThrough} pace={p} now={now} soonest={soonest} perLevel={perLevel} counted={Boolean(later)} />
        ) : null}
      </div>
    </div>
  )
}

// The slider under taught and coverage: from now to level 60, and what it
// says — through level L is when L+1 begins, at the dial's pace, so moving
// the dial moves its date. Radicals and vocabulary are counted from their
// own index; until it lands, or if it never does, they stay at what is
// taught now, and the line says so.
function Through({ level, at, onThrough, pace: p, now, soonest, perLevel, counted }) {
  const ahead = at ? project(p, level, perLevel, now, soonest) : null
  const reachedBy = ahead ? (at >= TOP_LEVEL ? ahead.done : ahead.startOf(at + 1)) : null

  return (
    <>
      <div className="slider">
        <input
          id="through-level"
          type="range"
          min={level}
          max={TOP_LEVEL}
          step={1}
          value={at ?? level}
          onChange={event => onThrough(Number(event.target.value))}
          aria-label="Taught and coverage through level"
          aria-valuetext={at ? `through level ${at}` : 'now'}
        />
        <div className="ticks" aria-hidden="true">
          <span className="start" style={{ left: 0 }}>
            now · level {level}
          </span>
          <span className="end" style={{ left: '100%' }}>
            level 60
          </span>
        </div>
      </div>
      <p className="notes" aria-live="polite">
        {at ? (
          <>
            <span className="soft">
              Through level {at}
              {reachedBy ? ` · ≈ ${monthYear(reachedBy)} at ${dayCount(perLevel)} days a level` : ''}
            </span>
            <span className="proj">
              Projection · once WaniKani has taught you everything through level {at}
              {counted ? '' : ' · radicals and vocabulary stay at what is taught now'}
            </span>
          </>
        ) : (
          <span className="hint">Drag the slider to see taught and coverage through a later level</span>
        )}
      </p>
    </>
  )
}

// A section whose read has not landed yet: its head in its place, so the
// board keeps its order while it fills in rather than shuffling as each
// read arrives.
function Waiting({ title }) {
  return (
    <section>
      <Head>{title}</Head>
      <p className="notes">
        <span className="hint">Reading…</span>
      </p>
    </section>
  )
}

// Every level from 1 to 60 has a slot: a passed level is a bar as tall as
// it took, this one is the accent with its projected remainder above it,
// every level ahead is a faint bar at the dial's pace, and a break is a
// dotted hairline — its place kept, its length kept out of the scale and
// named beneath, so leaving it out is never silent. A dashed line crosses
// the bars at the dial's pace and a dotted one at the median.
//
// **The six decades are marked across the bars** — a hairline where each
// begins, its name, and its date: `from` the unlock for one done, `since`
// in the accent for this one, ≈ at the dial's pace for one ahead, moving as
// the dial does. They replaced the road, which said the same 400px lower.
//
// **Pointing at a bar re-points the line right under it** — the days a level
// took and the day it began, the day this one is on, or when one ahead would
// start — with the legend beside it. The arrows walk it; the line is the live
// region. The slider is a native range: a finger, a drag, the arrow keys.
//
// **A goal: a level by a month**, chosen under the readings and remembered
// on this device (`kanigami-goal` — a level and a month, nothing else). The
// dial still opens at the median; the goal draws a solid line across the
// bars and a mark on the slider at the pace it asks for — the slowest that
// gets there, from `paceToReach` — and says whether the dial's pace does.
function PaceDial({ pace: p, level, now, soonest, fastest, perLevel, onPace, through = null }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  const [goal, setGoal] = useState(readGoal)
  if (p === undefined) return <Waiting title="days per level" />
  if (!p || (p.levels.length === 0 && !p.current)) return null

  const ahead = project(p, level, perLevel, now, soonest)
  const atMedian = project(p, level, p.median, now, soonest)
  const decades = road(p, level, now, perLevel, soonest)
  const byLevel = new Map(p.levels.map(l => [l.level, l]))
  const slots = Array.from({ length: TOP_LEVEL }, (_, i) => {
    const n = i + 1
    if (n === level) return { level: n, kind: 'current', days: p.current?.days ?? 0, began: p.current?.unlockedAt }
    if (n < level) {
      const held = byLevel.get(n)
      if (!held) return { level: n, kind: 'missing' }
      return { level: n, kind: held.break ? 'break' : 'passed', days: held.days, began: held.unlockedAt }
    }
    return { level: n, kind: ahead ? 'ahead' : 'empty' }
  })
  const breaks = p.levels.filter(l => l.break)
  const quickest = p.levels
    .filter(l => !l.break && l.level > ACCELERATED)
    .reduce((best, l) => (!best || l.days < best.days ? l : best), null)

  const min = fastest ? Math.ceil(fastest / STEP) * STEP : 1
  const max = Math.max(40, toStep((p.median ?? 0) * 2))

  // The goal, if one is set for a level still ahead: the month it names runs
  // to its last day, so `by` is the start of the month after.
  const aim = goal && goal.level > level ? goal : null
  const by = aim ? new Date(aim.year, aim.month + 1, 1) : null
  const need = aim ? paceToReach(p, level, aim.level, by, now, soonest, min, STEP, max) : null
  function choose(next) {
    const value = next && next.level > level ? next : null
    setGoal(value)
    writeGoal(value)
  }
  function chooseLevel(target) {
    if (!target) return choose(null)
    if (goal) return choose({ ...goal, level: target })
    // A first goal starts at the month the dial's pace reaches it.
    const at = ahead?.startOf(target) ?? new Date(now.getFullYear() + 1, now.getMonth(), 1)
    choose({ level: target, year: at.getFullYear(), month: at.getMonth() })
  }

  // Scaled by the passed levels, the dial and the goal, never by a break, and
  // never by a current level already longer than all of them — that stops at
  // the top.
  const passed = p.levels.filter(l => !l.break).map(l => l.days)
  const tallest = Math.max(1, ...passed, perLevel ?? 0, need ?? 0)
  const height = days => Math.min(100, (days / tallest) * 100)

  const shown = reading === null ? null : slots[reading]
  // A number right beside this level's gives way to it — 14 and 15 in
  // adjacent slots read as 1415.
  const numbered = s =>
    s.level === level ||
    s === shown ||
    s.level === through ||
    ((s.level === 1 || s.level % 10 === 0) && Math.abs(s.level - level) >= 3 && Math.abs(s.level - (through ?? -9)) >= 3)

  function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
      point(reading === null ? level - 1 : Math.min(TOP_LEVEL - 1, Math.max(0, reading + step)))
    }
    if (event.key === 'Escape') point(null)
  }

  const at = days => ((days - min) / (max - min)) * 100
  // The ends label the top row; the marks sit on the row beneath, where the
  // end labels cannot reach them. Two marks too close to share it become one
  // label at the first.
  const marks = [
    p.median !== null ? { label: `median ${dayCount(toStep(p.median))}`, at: at(p.median) } : null,
    p.recent !== null ? { label: `last five ${dayCount(toStep(p.recent))}`, at: at(p.recent) } : null
  ].filter(Boolean)
  if (marks.length === 2 && Math.abs(marks[0].at - marks[1].at) < 20) {
    marks.splice(0, 2, { label: `${marks[0].label} · ${marks[1].label}`, at: Math.min(marks[0].at, marks[1].at) })
  }

  const weeks = ahead && atMedian ? Math.round((ahead.done - atMedian.done) / (7 * 24 * 60 * 60 * 1000)) : 0

  return (
    <section className="dial">
      <Head right={`level ${level} of ${TOP_LEVEL}${perLevel !== null ? ` · at ${dayCount(perLevel)} days a level` : ''}`}>
        days per level
      </Head>

      <div className="chart">
        <div className="decades" aria-hidden="true">
          {decades.map(d => (
            <span key={d.name} className={d.state} style={{ left: `${((d.first - 1) / TOP_LEVEL) * 100}%` }}>
              <span>
                <span className="kanji-name">{d.kanji}</span> <span className="en">{d.name}</span>
              </span>
              <span className="when">
                {d.at ? (
                  <>
                    <span className="pre">{d.state === 'done' ? 'from ' : d.state === 'current' ? 'since ' : ''}</span>
                    {d.state === 'ahead' ? '≈ ' : ''}
                    {monthYear(d.at)}
                  </>
                ) : (
                  ''
                )}
              </span>
            </span>
          ))}
        </div>
        <div className="bars" role="group" aria-label="Days on each level, past and projected" onKeyDown={key} {...groupProps}>
          {slots.map((s, i) => (
            <span
              key={s.level}
              className={[
                s.kind,
                s.level === quickest?.level ? 'fastest' : '',
                through && s.level > level && s.level <= through ? 'within' : '',
                reading === i ? 'reading' : ''
              ]
                .join(' ')
                .trim()}
              {...itemProps(i)}
            >
              {s.kind === 'passed' ? <i style={{ height: `${Math.max(4, height(s.days))}%` }} /> : null}
              {s.kind === 'current' ? (
                <>
                  <i style={{ height: `${Math.max(4, height(s.days))}%` }} />
                  {perLevel !== null ? (
                    <i className="ahead" style={{ height: `${Math.max(0, height(perLevel) - height(s.days))}%` }} />
                  ) : null}
                </>
              ) : null}
              {s.kind === 'ahead' ? <i className="ahead" style={{ height: `${height(perLevel)}%` }} /> : null}
            </span>
          ))}
          {perLevel !== null ? <span className="pace-line" style={{ bottom: `${height(perLevel)}%` }} aria-hidden="true" /> : null}
          {need !== null ? <span className="goal-line" style={{ bottom: `${height(need)}%` }} aria-hidden="true" /> : null}
          {p.median !== null ? <span className="median-line" style={{ bottom: `${height(p.median)}%` }} aria-hidden="true" /> : null}
        </div>
      </div>
      <div className="levels" aria-hidden="true">
        {slots.map(s => (
          <span key={s.level} className={s.level === level ? 'hot' : s === shown || s.level === through ? 'soft' : ''}>
            {numbered(s) ? s.level : ''}
          </span>
        ))}
      </div>

      <div className="under">
        <p className="notes readout" aria-live="polite">
          <span className={shown ? 'usual hidden' : 'usual'}>
            <Hint pointer="Point at" touch="Tap">
              a bar for its level, or drag the slider to change the pace
            </Hint>
          </span>
          {shown ? (
            <span className="usual">
              <span className="soft">{caption(shown, ahead, perLevel)}</span>
            </span>
          ) : null}
        </p>
        {quickest || breaks.length > 0 ? (
          <p className="notes flags">
            {quickest ? (
              <span>
                <i className="swatch fastest" aria-hidden="true" />
                Your fastest · level {quickest.level}, {Math.round(quickest.days)} days
              </span>
            ) : null}
            {breaks.length > 0 ? (
              <span>
                <i className="swatch break" aria-hidden="true" />
                {breaks.length === 1 ? 'Level' : 'Levels'} {breaks.map(b => b.level).join(', ')} left out as{' '}
                {breaks.length === 1 ? 'a break' : 'breaks'} · {breaks.map(b => `${Math.round(b.days)} days`).join(', ')}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {perLevel !== null ? (
        <div className="slider">
          <input
            id="pace-dial"
            type="range"
            min={min}
            max={max}
            step={STEP}
            value={Math.min(max, Math.max(min, perLevel))}
            onChange={event => onPace(Number(event.target.value))}
            aria-label="Days per level, for the projection"
            aria-valuetext={`${dayCount(perLevel)} days a level`}
          />
          <div className={['ticks', marks.length ? 'has-low' : '', need !== null ? 'has-goal' : ''].join(' ').trim()} aria-hidden="true">
            <span className="start" style={{ left: 0 }}>
              {dayCount(min)} days{fastest ? <span className="aside">, WaniKani’s fastest</span> : ''}
            </span>
            {marks.map(m => (
              <span key={m.label} className="mark low" style={{ left: `${Math.max(8, Math.min(92, m.at))}%` }}>
                {m.label}
              </span>
            ))}
            {need !== null ? (
              <span className="mark goal" style={{ left: `${Math.max(4, Math.min(96, at(need)))}%` }}>
                goal {dayCount(need)}
              </span>
            ) : null}
            <span className="end" style={{ left: '100%' }}>
              {max} days
            </span>
          </div>
        </div>
      ) : null}

      {ahead ? (
        <div className="readings" aria-live="polite">
          <div>
            <b>{dayCount(perLevel)}</b>
            <span>days a level</span>
          </div>
          {/* Reaching 60 is the date people mean; at 60, finishing it. */}
          <div>
            <b>≈ {monthYear(level < TOP_LEVEL ? ahead.startOf(TOP_LEVEL) : ahead.done)}</b>
            <span>{level < TOP_LEVEL ? 'level 60' : 'level 60 done'}</span>
          </div>
          <div className="against">
            <span className="soft">
              {perLevel === toStep(p.median)
                ? 'Your median pace'
                : weeks === 0
                  ? 'About the same as your median pace'
                  : `${Math.abs(weeks)} ${Math.abs(weeks) === 1 ? 'week' : 'weeks'} ${weeks < 0 ? 'sooner' : 'later'} than at your median`}
            </span>
          </div>
        </div>
      ) : null}

      <div className="goalset">
        <span>Goal</span>
        <select
          id="goal-level"
          aria-label="Goal level"
          value={aim ? aim.level : ''}
          onChange={event => chooseLevel(Number(event.target.value) || null)}
        >
          <option value="">none</option>
          {Array.from({ length: TOP_LEVEL - level }, (_, i) => level + 1 + i).map(n => (
            <option key={n} value={n}>
              level {n}
            </option>
          ))}
        </select>
        {aim ? (
          <>
            <span>by</span>
            <select
              id="goal-month"
              aria-label="Goal month"
              value={aim.month}
              onChange={event => choose({ ...aim, month: Number(event.target.value) })}
            >
              {MONTH_NAMES.map((name, m) => (
                <option key={name} value={m}>
                  {name}
                </option>
              ))}
            </select>
            <select
              id="goal-year"
              aria-label="Goal year"
              value={aim.year}
              onChange={event => choose({ ...aim, year: Number(event.target.value) })}
            >
              {goalYears(now, aim.year).map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {need !== null && need !== perLevel ? (
              <button className="quiet" type="button" onClick={() => onPace(need)}>
                Set the dial to it
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {aim ? (
        <p className="notes" aria-live="polite">
          {need === null ? (
            <span className="hot">
              Level {aim.level} by {MONTH_NAMES[aim.month]} {aim.year} is sooner than WaniKani’s intervals allow
            </span>
          ) : (
            <span className="soft">
              To reach level {aim.level} by {MONTH_NAMES[aim.month]} {aim.year}:{' '}
              <span className="strong">{dayCount(need)} days a level</span> —{' '}
              {perLevel !== null && perLevel <= need
                ? 'the dial’s pace gets there'
                : `${dayCount(toStep(perLevel - need))} days a level faster than the dial`}
            </span>
          )}
        </p>
      ) : null}

      {ahead ? (
        <p className="notes">
          <span className="proj">
            Projection · a level every {dayCount(perLevel)} days from here, this one no sooner than its earliest level-up
          </span>
        </p>
      ) : null}
    </section>
  )
}

// The goal, kept on this device: `{ level, year, month }`, month 0–11.
// Anything else in the slot is the same as no goal.
const GOAL_KEY = 'kanigami-goal'
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function readGoal() {
  try {
    const g = JSON.parse(localStorage.getItem(GOAL_KEY))
    const whole = n => Number.isInteger(n)
    if (g && whole(g.level) && whole(g.year) && whole(g.month) && g.month >= 0 && g.month < 12) return g
  } catch {
    // Unreadable is the same as no goal.
  }
  return null
}

function writeGoal(goal) {
  try {
    if (goal) localStorage.setItem(GOAL_KEY, JSON.stringify(goal))
    else localStorage.removeItem(GOAL_KEY)
  } catch {
    // No storage: the goal lasts this visit.
  }
}

// This year and the next eight, and the goal's own year if it is outside
// them, so a goal set long ago still shows what it was set to.
function goalYears(now, held) {
  const years = Array.from({ length: 9 }, (_, i) => now.getFullYear() + i)
  if (!years.includes(held)) years.unshift(held)
  return years
}

// What a pointed-at slot says.
function caption(s, ahead, perLevel) {
  const began = s.began ? ` · began ${dayMonthYear(s.began)}` : ''
  if (s.kind === 'passed') return `Level ${s.level} · ${Math.round(s.days)} days${began}`
  if (s.kind === 'break') return `Level ${s.level} · ${Math.round(s.days)} days · break${began}`
  if (s.kind === 'current') return `Level ${s.level} · day ${Math.floor(s.days) + 1} so far${began}`
  if (s.kind === 'missing') return `Level ${s.level} · no record`
  if (s.kind === 'ahead') return `Level ${s.level} ≈ ${monthYear(ahead.startOf(s.level))} at ${dayCount(perLevel)} days a level`
  return `Level ${s.level}`
}

// Everything taught so far, against how much of it WaniKani has: the count,
// a hairline lit to the share, and the share and the total in words — the
// hairline alone is a length to estimate. The totals are commentary (cached
// a week, and an old copy kept if the refresh fails); without them, the
// bare counts.
//
// Each hairline carries a tick where its next count milestone falls, so the
// milestones' ladder has a place on the line it counts along.
//
// **Through a later level** (`at`, from the slider beneath), each line gains
// what WaniKani teaches up to there, faint beyond what is taught, with `+N` —
// coverage's pattern — and the head's share of all WaniKani moves with them.
// Until the radicals and words ahead are read (`counted`), only the kanji
// line moves: the other two step back and the head names the level instead.
function Taught({ learned: counts, totals, next = [], at = null, gains = {}, counted = false }) {
  if (counts.total === 0) return null
  const nextOf = kind => next.find(m => m.kind === kind)

  const all = totals ? totals.radical + totals.kanji + totals.vocabulary : null

  const kinds = [
    ['radical', counts.radical, totals?.radical, 'radicals', gains.radical ?? 0],
    ['kanji', counts.kanji, totals?.kanji, 'kanji', gains.kanji ?? 0],
    ['vocabulary', counts.vocabulary, totals?.vocabulary, 'vocabulary', gains.vocabulary ?? 0]
  ]
  const moved = kinds.reduce((sum, [, , , , more]) => sum + more, 0)
  const head = !all
    ? null
    : at && !counted
      ? `through level ${at}`
      : `${share(Math.min(all, counts.total + moved), all)} of all wanikani`

  return (
    <section>
      <Head right={head}>taught</Head>
      <div className="fills">
        {kinds.map(([kind, now, total, word, more]) => {
          const count = Math.min(total ?? Infinity, now + more)
          return (
            <div key={kind} className={at && !counted && kind !== 'kanji' ? 'kind still' : 'kind'}>
              {/* Without a total there is no track or denominator, so the count
                  takes the whole row rather than one cell of three. */}
              <span className={total ? `wk-${kind}` : `wk-${kind} alone`}>
                {more > 0 ? <span className="plus">+{many(count - now)} </span> : null}
                {many(count)} {word}
              </span>
              {total ? (
                <>
                  <span className="of">
                    <span className="soft">{share(count, total)}</span> of {many(total)}
                  </span>
                  <span className="track" aria-hidden="true">
                    {more > 0 ? (
                      <span className={`fill gain wk-${kind}`} style={{ width: `${Math.min(100, (count / total) * 100)}%` }} />
                    ) : null}
                    <span
                      className={`fill wk-${kind}`}
                      style={{ width: `${Math.min(100, (now / total) * 100)}%` }}
                    />
                    {nextOf(kind) ? (
                      <span className="tick" style={{ left: `${Math.min(100, (nextOf(kind).step / total) * 100)}%` }} />
                    ) : null}
                  </span>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The count milestones: the next round number for each kind, soonest first,
// with how many to go and when at the last 30 days' pace, then the ones
// already reached, newest first, dated by WaniKani's own records. The
// reached list is the latest few — a long account passes dozens.
const REACHED_SHOWN = 5

//
// **Upcoming burns lead it**: the enlightened items whose next review is the
// burn, day by day for the week — the nearest thing you can do that ends in
// one. Hidden when there are none.
function Milestones({ milestones: m, burns = [], now }) {
  if (m === undefined) return <Waiting title="milestones" />
  if (!m || (m.next.length === 0 && m.reached.length === 0)) return null
  const reached = m.reached.slice(0, REACHED_SHOWN)
  const burning = burns.reduce((sum, d) => sum + d.count, 0)
  const most = Math.max(1, ...burns.map(d => d.count))

  return (
    <section className="milestones">
      <Head>milestones</Head>
      {burning > 0 ? (
        <div className="burns">
          <span className="burnline">
            {many(burning)} up for burning this week · {many(burns[0].count)} today
          </span>
          <div className="burnrow" aria-hidden="true">
            {burns.map((d, i) => (
              <span key={d.day.getTime()} className={i === 0 ? 'today' : ''}>
                <i style={{ height: d.count ? `${Math.max(6, (d.count / most) * 100)}%` : '2px' }} />
              </span>
            ))}
          </div>
          <div className="burnaxis">
            {burns.map((d, i) => (
              <span key={d.day.getTime()}>
                <b>{many(d.count)}</b>
                {i === 0 ? 'today' : weekday(d.day)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <ul className="ladder">
        {m.next.map((n, i) => (
          <li key={n.kind} className={i === 0 ? 'next soonest' : 'next'}>
            <span className="what">{n.label}</span>
            <span className="togo">{many(n.togo)} to go</span>
            <span className="when">{n.at ? `≈ ${roughly(n.at, now)}` : ''}</span>
          </li>
        ))}
        {reached.length > 0 ? (
          <li className="divider" aria-hidden="true">
            <span>reached</span>
          </li>
        ) : null}
        {reached.map(r => (
          <li key={r.label} className="reached">
            <span className="what">{r.label}</span>
            <span className="when">{dayMonthYear(r.at)}</span>
          </li>
        ))}
      </ul>
      {m.next.some(n => n.at) ? (
        <p className="notes">
          <span className="proj">≈ at your last 30 days’ pace, not the dial’s · reached dates are WaniKani’s</span>
        </p>
      ) : null}
    </section>
  )
}

// Coverage: how much of the JLPT levels, or the Jōyō grades, you have been
// taught — and, through a later level (`at`, from the slider it shares with
// taught), how much once WaniKani has taught you every kanji up to there,
// the gain drawn faint beyond what is taught now.
//
// The share column is as wide as its widest value at any point on the
// slider, worked out up front, so dragging never narrows the hairlines.
const MEASURES = [
  ['JLPT', 'JLPT', 'Unofficial lists — the JLPT stopped publishing them in 2010'],
  ['JOYO', 'Jōyō', 'The 2,136 Jōyō kanji by school grade, as allocated in 2010']
]

function Coverage({ coverage: c, at }) {
  const [measure, setMeasure] = useState('JLPT')
  if (c === undefined) return <Waiting title="coverage" />
  if (!c) return null

  const lists = c.lists[measure]
  const nowRows = coverage(lists, c.taught)
  const thenRows = at ? coverage(lists, throughLevel(c.index, c.taught, at)) : nowRows
  const endRows = coverage(lists, throughLevel(c.index, c.taught, TOP_LEVEL))
  const widest = Math.max(
    ...endRows.map((row, i) => `+${row.have - nowRows[i].have} 100% ${many(row.have)} of ${many(row.total)}`.length)
  )

  return (
    <section>
      <Head right={at ? `through level ${at}` : null}>coverage</Head>
      <div className="switch" role="group" aria-label="Measure coverage against">
        {MEASURES.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={key === measure} onClick={() => setMeasure(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="cover" style={{ '--share-width': `${widest + 1}ch` }}>
        {thenRows.map((row, i) => {
          const before = nowRows[i].have
          return (
            <div key={row.name} className="row">
              <span className="name">{row.name}</span>
              <span className="track" aria-hidden="true">
                <span className="fill gain" style={{ width: `${(row.have / row.total) * 100}%` }} />
                <span className="fill" style={{ width: `${(before / row.total) * 100}%` }} />
              </span>
              <span className="pct">
                {at && row.have > before ? <span className="plus">+{many(row.have - before)} </span> : null}
                <span className="soft">{share(row.have, row.total)}</span> {many(row.have)} of {many(row.total)}
              </span>
            </div>
          )
        })}
      </div>
      <p className="notes">
        <span className="hint">{MEASURES.find(([key]) => key === measure)[2]}</span>
      </p>
    </section>
  )
}

// A share as a whole percentage — except that something taught is never 0%,
// and nothing short of all of it is 100%.
function share(count, total) {
  const exact = (count / total) * 100
  if (count > 0 && exact < 1) return '<1%'
  if (count < total && exact > 99) return '>99%'
  return `${Math.round(exact)}%`
}

// One segmented hairline, and the counts as one line of type beneath it,
// each in its band's colour — the colour is what ties a number to its
// segment. Never five cards with five numbers in them.
function Spread({ spread: bands }) {
  if (bands.total === 0) return null

  return (
    <div className="spreadline">
      <div className="segments" aria-hidden="true">
        {bands.bands
          .filter(band => band.count > 0)
          .map(band => (
            <span key={band.key} className={`segment srs-${band.key}`} style={{ flexGrow: band.count }} />
          ))}
      </div>
      <p className="counts">
        {bands.bands.map(band => (
          <span key={band.key} className={`srs-${band.key}`}>
            {band.key} {many(band.count)}
          </span>
        ))}
      </p>
    </div>
  )
}



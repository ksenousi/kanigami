import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  getLevelKanji,
  getLevelRadicals,
  getLevelVocabulary,
  getLevelKanjiSubjects,
  getLevelProgressions,
  getReviewStatistics,
  getSpacedRepetitionSystems,
  getStartedAssignments,
  getSummary,
  getUser
} from '../lib/wanikani.js'
import { dueNow, forecastAhead, kanjiPassed, learned, lessonsWaiting, spread } from '../lib/standing.js'
import {
  accuracy,
  accuracyByLevel,
  earliestLevelUp,
  fastestLevel,
  LEVEL_STANDINGS,
  levelStandings,
  levelKanji,
  levelUpItems,
  lockedBehind,
  medianWorking,
  milestones,
  RECENT,
  moved,
  nextUp,
  pace,
  paceToReach,
  project,
  road,
  srsSystems
} from '../lib/board.js'
import { clock, count as many, dayMonth, dayMonthYear, monthYear, roughly, when } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import { subjectTotals } from '../lib/totals.js'
import { kanjiIndex } from '../lib/kanjiIndex.js'
import { coverage, taughtKanji, throughLevel } from '../lib/coverage.js'
import { aheadByLevel, aheadIndex } from '../lib/aheadIndex.js'
import Forecast from './Forecast.jsx'
import Hint from './Hint.jsx'
import useOnline from './useOnline.js'
import usePointing from './usePointing.js'
import useScrollKeys from './useScrollKeys.js'

// 盤 The board — the whole app. Decided from a prototype: of four
// directions (everything at once, time leads, the level is the page, the
// almanac) and four branches of the first, the original "everything at
// once" was picked. See "The dashboard" in PLAN.md.
//
// j and k scroll it and d and u jump band to band (useScrollKeys).
//
// The figures in the masthead, then two bands, each named on its hairline
// (PLAN.md, "The regroup", then "The strip carries the kanji"): 今 now — the
// level as its strip, beside the week ahead and the SRS spread; 先 ahead — the pace dial, then taught, coverage and the
// milestones a row each, the first two following a level chosen on the
// dial's bars.
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
  useScrollKeys()
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
      // The level's radicals, for the level's count of what still
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
          hours: forecastAhead(summary, started),
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

        // How far each level stands as a whole, placed by the two indexes;
        // waits on both.
        Promise.all([extra, later]).then(([[kanjiIdx], aheadIdx]) => {
          if (!live) return
          const levelOf = kanjiIdx && aheadIdx ? new Map([...kanjiIdx, ...aheadIdx].map(([id, n]) => [id, n])) : null
          setBoard(held => ({ ...held, standings: levelOf ? levelStandings(levelOf, started, TOP_LEVEL) : null }))
        })

        // Right answers by level: the statistics, placed by the two indexes.
        // Waits on all three, the slowest being the ahead index; without any
        // of them, no strip.
        Promise.all([commentary, extra, later]).then(([[statistics], [kanjiIdx], aheadIdx]) => {
          if (!live) return
          const levelOf = statistics && kanjiIdx && aheadIdx ? new Map([...kanjiIdx, ...aheadIdx].map(([id, n]) => [id, n])) : null
          setBoard(held => ({ ...held, byLevel: levelOf ? accuracyByLevel(statistics, levelOf, TOP_LEVEL) : null }))
        })

        extra.then(([index, lists]) => {
          if (!live) return
          setBoard(held => ({
            ...held,
            coverage: index && lists ? { index, taught: taughtKanji(index, started), lists: { JLPT: lists.JLPT, JOYO: lists.JOYO } } : null
          }))
        })

        return commentary.then(([statistics, progressions, totals, systems, radicals]) => {
          if (!live) return
          const srs = systems ? srsSystems(systems) : null
          const radicalItems = radicals ? levelKanji(radicals[0], radicals[1]) : null
          setBoard(held => ({
            ...held,
            totals,
            milestones: milestones(started, now, totals),
            levelUp: srs ? earliestLevelUp(kanji, srs, passed.remaining, now, radicalItems) : null,
            waitingOn: levelUpItems(kanji, radicalItems, passed.remaining),
            // The level's own system — the accelerated one on levels 1–2.
            fastest: srs ? fastestLevel(srs.get(kanji.find(k => k.system)?.system)) : null,
            accuracy: statistics ? accuracy(statistics) : null,
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
        {board && !blocking ? (
          <Figures board={board} />
        ) : (
          <>
            <span className="tag">kanigami</span>
            <span className="eyebrow">
              level {user.level} · {user.username}
            </span>
          </>
        )}
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
          <Band kanji="今" name="Now · this level, and what’s due">
            {/* The level beside what is due: its kanji as the strip, a block
                each with the character under it, then the tally and the
                reads; the week ahead and the SRS spread in the other column.
                The level line and the level's grid were one section each
                until they were merged (PLAN.md, "The strip carries the
                kanji"). */}
            <div className="now-pair">
              <div className="column">
                <Level
                  key={user.level}
                  board={board}
                  level={user.level}
                  token={token}
                  perLevel={paceFor(board.pace, chosenPace)}
                />
              </div>
              <div className="column">
                <Forecast
                  summary={board.summary}
                  hours={board.hours}
                  waitingOn={user.level < TOP_LEVEL ? (board.waitingOn ?? []) : []}
                  nextLevel={user.level + 1}
                />
                <Srs spread={board.spread} moved={board.moved} />
              </div>
            </div>
          </Band>
          <Band kanji="先" name="Ahead · pace, and what you’ll know">
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
              byLevel={board.byLevel}
              standings={board.standings}
            />
          </Band>
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

const TOP_LEVEL = 60

// How many kanji the next-up line names before it counts them instead.
const NAMED = 4

// A section's hairline heading: what it is on the left, its one number on
// the right. Not a box — the rule is the only thing drawn.
// 今 now and 先 ahead: the board's two bands, each named on the
// hairline that opens it. The name is a sentence, not a head — the sections
// inside keep their own.
function Band({ kanji, name, children }) {
  return (
    <div className="band">
      <p className="band-name">
        <span className="jp">{kanji}</span> {name}
      </p>
      {children}
    </div>
  )
}

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
// The kanji to the next level was a figure here; it is the level's head
// now, beside the rest of what the level says. The seven days'
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

// 段 Under the level's strip, what the level says: the counts by state,
// the radicals holding its locked kanji, then the reads — what is next,
// what the level-up waits on, and the next level: fastest, at your
// last-five pace, and at the dial when it has been moved. It was the level
// line, a section with its own strip (PLAN.md, "The level line"), until
// the strip and the level's grid were merged (PLAN.md, "The strip carries
// the kanji"); the strip is the grid's now.
//
// Every state is WaniKani's, read off an assignment. The fastest level-up
// runs WaniKani's own intervals and the dates run a pace; all are
// projections, and the line beneath says so.
// Apprentice is drawn stage by stage, a hue to each — bubblegum, grape, sky,
// mint — so the strip says how far each kanji has to go. Passed keys even at
// none: its colour is the one being worked towards, and a strip of no passes
// has to say what one looks like.
const STATES = [
  ['passed', 'passed'],
  ['a4', 'apprentice IV'],
  ['a3', 'apprentice III'],
  ['a2', 'apprentice II'],
  ['a1', 'apprentice I'],
  ['lesson', 'in lessons'],
  ['locked', 'locked']
]
const stateOf = k => (k.state === 'apprentice' ? `a${k.stage}` : k.state)

// `counts`: the tally and the holding line, which are the kanji's — left
// out while the strip shows the radicals.
function LevelReads({ board, level, perLevel, counts = true }) {
  const { remaining, total } = board.passed
  const kanji = board.kanji
  const tally = Object.fromEntries(STATES.map(([state]) => [state, kanji.filter(k => stateOf(k) === state).length]))
  const p = board.pace
  const top = level >= TOP_LEVEL
  const levelUp = board.levelUp
  // The fastest the next level can come, every answer right — through the
  // locked kanji's radicals when it waits on them — and the next level at
  // your last-five pace and, when it has been moved off it, at the dial.
  // Neither pace can beat the fastest.
  const fastest = levelUp?.at ?? levelUp?.chained ?? null
  const home = homePace(p)
  const at = days => (!top && days !== null && p ? project(p, level, days, board.now, fastest)?.startOf(level + 1) : null)
  const atHome = at(home)
  const atDial = perLevel !== home ? at(perLevel) : null
  const ahead = Boolean(fastest || atHome || atDial)

  const next = board.next
  let up = null
  if (top || total === 0) up = null
  else if (remaining === 0) up = 'Ready — WaniKani levels you up on its next look'
  // Waiting on locked kanji gets no read: the tally counts them and the
  // holding line names the radicals behind them.
  else if (levelUp === undefined) up = 'Reading…'

  return (
    <div className="level-line">
      {counts && total > 0 ? (
        <>
          <p className="tally">
            {STATES.filter(([state]) => tally[state] > 0 || state === 'passed').map(([state, word]) => (
              <span key={state}>
                <i className={state} aria-hidden="true" />
                {many(tally[state])} {word}
              </span>
            ))}
          </p>
          <Holding behind={board.behind} />
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
            <span className="what">level {level + 1}</span>
            {fastest ? <span>Fastest {when(fastest, board.now)}</span> : null}
            {atHome ? (
              <span>
                At your last-five pace ≈ {dayMonth(atHome)}, {dayCount(home)} days a level
              </span>
            ) : null}
            {atDial ? (
              <span>
                At the dial ≈ {dayMonth(atDial)}, {dayCount(perLevel)} days a level
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {ahead || board.behind?.blockers.some(b => b.at) ? (
        <p className="notes">
          <span className="proj">
            {[
              fastest || board.behind?.blockers.some(b => b.at) ? 'Fastest and soonest assume every answer is right' : null,
              atHome || atDial ? '≈ at a pace, from now' : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
      ) : null}
    </div>
  )
}


// The level's head: `day 5 · 20 of 28 needed`, or passed of all on the
// last level, which has no level-up to count towards.
function levelCount(board, level) {
  const { passed, needed, total } = board.passed
  const days = board.pace?.current?.days
  const top = level >= TOP_LEVEL
  return [
    days !== undefined ? `day ${Math.floor(days) + 1}` : null,
    total > 0 ? (top ? `${passed} of ${total} passed` : `${passed} of ${needed} needed`) : null
  ]
    .filter(Boolean)
    .join(' · ')
}

// What keeps the locked kanji locked, as one line under the strip: each of
// the level's radicals not yet passed, its name, the locked kanji it holds
// and the soonest it could pass — the strip's cells say the same kanji by
// kanji. Decided from a prototype (PLAN.md, "Locked behind"): the strip
// saying it was picked over rows, the grid and a map. Hidden when nothing on
// the level is locked.
//
// A level's radicals are usually taught together and so pass together: when
// every one of them has the same soonest day, it is said once at the end
// rather than eight times — the list was the tallest thing on the board.
function Holding({ behind }) {
  if (!behind || (behind.blockers.length === 0 && behind.others.length === 0)) return null
  const days = behind.blockers.map(b => (b.at ? dayMonth(b.at) : null))
  const shared = days.length > 1 && days[0] !== null && days.every(d => d === days[0]) ? days[0] : null

  return (
    <p className="holding">
      {behind.blockers.map(({ radical: r, holds, at }) => (
        <span key={r.id}>
          <span className={`radical ${standing(r)}`}>{glyph(r)}</span> <span className="soft">{r.meaning}</span> →{' '}
          <span className="kanji-held">
            {holds.map(k => (
              <span key={k.id}>{glyph(k)}</span>
            ))}
          </span>
          {at && !shared ? <span className="dim"> · soonest {dayMonth(at)}</span> : null}
        </span>
      ))}
      {shared ? <span className="dim">each soonest {shared}</span> : null}
      {behind.others.length > 0 ? (
        <span>
          <span className="kanji-held">
            {behind.others.map(k => (
              <span key={k.id}>{glyph(k)}</span>
            ))}
          </span>
          <span className="dim"> · a radical from another level</span>
        </span>
      ) : null}
    </p>
  )
}

// Each locked kanji's radicals still in the way, by kanji id, for its block
// in the strip.
function holdersOf(behind) {
  const holders = new Map()
  for (const { radical, holds } of behind?.blockers ?? []) {
    for (const k of holds) holders.set(k.id, [...(holders.get(k.id) ?? []), radical])
  }
  return holders
}

// Where a kanji or radical stands, as the strip's class: its state,
// and for apprentice its stage, so it wears that stage's hue.
function standing(item) {
  return item.state === 'apprentice' ? `apprentice a${item.stage}` : item.state
}

// A subject's character, or WaniKani's image for a radical without one.
function glyph(item) {
  return item.characters ?? (item.image ? <img src={item.image} alt="" /> : '〓')
}

function percent(fraction) {
  return fraction === null ? '–' : Math.round(fraction * 100)
}

// 段 The level — where it stands, at the head of the board. Every kanji of
// the level, locked ones included, as one strip: a block each in its
// state's colour — passed tangerine, apprentice a hue a stage, lessons
// faint, locked the rule — in progress order, with the character under it
// and a line where the 90% WaniKani levels you up at falls. The head says
// the day and the count against that 90%; under the strip, the tally and
// the reads (`LevelReads`). Decided from a prototype (PLAN.md, "The strip
// carries the kanji"): the level line's strip and the level's grid were two
// sections saying the same kanji twice. Each cell's label carries all of
// it in words.
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
// asked for. The radicals take the strip as the kanji do; words are as
// long as they are, so they flow instead.
const KINDS = ['kanji', 'radicals', 'vocab']
const OTHERS = {
  radicals: { read: getLevelRadicals, noun: 'radicals', one: 'a radical' },
  vocab: { read: getLevelVocabulary, noun: 'vocabulary', one: 'a word' }
}

function Level({ board, level, token, perLevel }) {
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

  const holders = holdersOf(board.behind)
  const other = OTHERS[showing]
  // The radicals come with the board's commentary now; asked for before it
  // lands, or if it failed, they are read as before.
  const kept = showing === 'radicals' && Array.isArray(board.radicals) ? board.radicals : others[showing]
  const items = other ? kept : board.kanji
  const otherPassed = other && Array.isArray(items) ? items.filter(r => r.state === 'passed').length : null
  // The kanji's count, the day, what is next and the level-up are the level
  // line's now, at the top of the board. Radicals and vocabulary have no
  // threshold and no line of their own, so their count stays here.
  const count = other && otherPassed !== null ? `${otherPassed} of ${items.length} passed` : null

  const top = level >= TOP_LEVEL
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
        <span>{levelCount(board, level)}</span>
      </div>
      <div className="body">
        {!other && board.kanji.length === 0 ? (
          <p className="notes">
            <span className="soft">No kanji at this level yet</span>
          </p>
        ) : !other ? (
          <Grid
            items={board.kanji}
            label={`Level ${level} kanji`}
            onRead={setReading}
            holders={holders}
            need={top ? null : board.passed.needed}
            strip
          />
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
            strip={showing !== 'vocab'}
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
      <LevelReads board={board} level={level} perLevel={perLevel} counts={!other} />
    </section>
  )
}

// The level's subjects — kanji or radicals as the strip, words flowing.
// `onRead` hears the item under the pointer or the keyboard, and null when
// both leave.
//
// Each cell links out to its WaniKani page. A mouse clicks through, since
// it reads by hovering; **a finger's first tap reads and its second opens**,
// so tapping for the next review never leaves the board. Enter opens the
// cell the arrows are on. The links stay out of the tab order, which the
// grid already walks as one stop.
//
// The strip is a block a subject, its character under it at the label's
// size — pointing at one reads it large in the readout — and a line beside
// the block where `need` is reached. `words` lets the cells run as wide as
// their word instead, so a row holds as many as fit; up and down then go to
// the word nearest above or below.
function Grid({ items, label, onRead, words = false, holders = null, need = null }) {
  const { at, point, groupProps, itemProps } = usePointing(i => onRead(i === null ? null : items[i]))
  const across = useAcross(groupProps.ref, words ? 0 : items.length)
  const opens = useRef(true)

  function key(event) {
    const sideways = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    const down = { ArrowUp: -1, ArrowDown: 1 }[event.key]
    if (sideways || down) {
      event.preventDefault()
      if (at === null) point(0)
      else if (down && words) point(below(event.currentTarget, at, down) ?? at)
      else point(Math.min(items.length - 1, Math.max(0, at + (sideways ?? down * across))))
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
      className={words ? 'kanji words' : 'kanji strip'}
      style={words ? undefined : { '--across': across }}
      role="list"
      aria-label={label}
      onKeyDown={key}
      {...groupProps}
    >
      {items.map((k, i) => (
        <li
          key={k.id}
          className={[standing(k), at === i ? 'reading' : '', need === i + 1 ? 'need' : ''].join(' ').trim()}
          {...itemProps(i)}
        >
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
            {words ? null : <i className="bar" aria-hidden="true" />}
            <span className="character" aria-hidden="true">
              {k.characters ?? (k.image ? <img src={k.image} alt="" /> : '〓')}
            </span>
            {/* A word keeps its mark under it: pips lit to its apprentice
                stage, or one rule. */}
            {!words ? null : k.state === 'apprentice' ? (
              <span className="pips" aria-hidden="true">
                {[1, 2, 3, 4].map(n => (
                  <i key={n} className={n <= k.stage ? 'lit' : ''} />
                ))}
              </span>
            ) : (
              <span className="underline" aria-hidden="true" />
            )}
            {/* A locked kanji wears the radicals still holding it. */}
            {holders?.get(k.id) ? (
              <span className="by" aria-hidden="true">
                {holders.get(k.id).map(r => (
                  <span key={r.id}>{glyph(r)}</span>
                ))}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  )
}

// How many blocks a row of the strip holds, from the width it has: one row
// while every block gets STRIP_CELL px; past that, as few rows as fit,
// split evenly, so a level never ends on a row of one or two. On a laptop
// a level's thirty-odd kanji take one row of the column; on a phone, two.
const STRIP_CELL = 18

function useAcross(ref, count) {
  const [across, setAcross] = useState(count)
  useLayoutEffect(() => {
    const list = ref.current
    if (!list || !count) return
    const fit = () => {
      const rows = Math.max(1, Math.ceil((count * STRIP_CELL) / Math.max(1, list.clientWidth)))
      setAcross(Math.ceil(count / rows))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(fit)
    watch.observe(list)
    return () => watch.disconnect()
  }, [ref, count])
  return across
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

// 歩 Ahead — the pace dial, then taught and coverage side by side under one
// "through level" slider: everything on the board that the dial's pace
// moves, in one band. Decided from a prototype (the dial, PLAN.md) and
// regrouped after a design review (PLAN.md, "The regrouping"), which found
// projections scattered over five places and the road repeating the dial's
// decade marks 400px below them. The milestones went back to column two
// when the slider took taught along: they keep their own clock.
//
// The dial starts at your last five levels' median — the pace you are on now,
// which the whole history's median can hide — falling back to the median
// with fewer than one level timed. It is never saved: the board opens on
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

// Your pace as the board opens on it: the last five levels', rounded to the
// dial's step.
function homePace(p) {
  const days = p?.recent ?? p?.median ?? null
  return days !== null ? toStep(days) : null
}

// The dial's pace: what it was set to, or your last-five pace.
function paceFor(p, chosen) {
  return chosen !== null ? chosen : homePace(p)
}

function Ahead({ pace: p, level, now, soonest, fastest, perLevel, onPace, learned: counts, totals, later, milestones: m, coverage: c, byLevel, standings }) {
  const [through, setThrough] = useState(null)
  // Only a level ahead is a projection, and choosing one needs the kanji
  // index, so it waits for coverage's read.
  const at = c && through !== null && through > level ? through : null
  const gains = {
    radical: at && later ? later.radical[at] : 0,
    kanji: at ? throughLevel(c.index, c.taught, at).size - c.taught.size : 0,
    vocabulary: at && later ? later.vocabulary[at] : 0
  }

  return (
    <div className="forward">
      {/* The dial, and beside it taught and coverage, which follow the level
          chosen on its bars; the milestones laid across under both. */}
      <PaceDial
        pace={p}
        level={level}
        now={now}
        soonest={soonest}
        fastest={fastest}
        perLevel={perLevel}
        onPace={onPace}
        through={at}
        onThrough={c ? setThrough : null}
        counted={Boolean(later)}
        rightByLevel={byLevel}
        standings={standings}
      />
      <div className="rows">
        <Taught learned={counts} totals={totals} next={m?.next} at={at} gains={gains} counted={Boolean(later)} />
        <Coverage coverage={c} at={at} />
      </div>
      <Milestones milestones={m} now={now} />
    </div>
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
//
// **Pointing at the median or last-five mark shows its working** on a line
// right under the marks: every level it was taken over, quickest first, the
// middle one or two in strong ink and their bars lit — so 18 is a figure you
// can check. Under them, not in the bars' readout above, so nothing moves
// beneath the pointer.
//
// **Under the level numbers, right answers by level** — a second row of
// sixty bars, each as tall as the share of answers right on that level's
// items, every review to date (`accuracyByLevel`; not how you did while on
// it). Scaled from 80%, or the tenth below the lowest, to 100%, with your
// overall dashed across. Pointing at either row reads both in the line.
// Undefined while it reads, keeping its room; null, and gone, if it can't.
function PaceDial({ pace: p, level, now, soonest, fastest, perLevel, onPace, through = null, onThrough = null, counted = true, rightByLevel, standings = null }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  // A mouse chooses on its click; a finger's first tap reads the bar and
  // the second chooses it, as a kanji's second tap opens it.
  const chooses = useRef(true)
  const atMedianMark = usePointing()
  const atRecentMark = usePointing()
  const [goal, setGoal] = useState(readGoal)
  if (p === undefined) return <Waiting title="days per level" />
  if (!p || (p.levels.length === 0 && !p.current)) return null

  const ahead = project(p, level, perLevel, now, soonest)
  const decades = road(p, level, now, perLevel, soonest)
  const byLevel = new Map(p.levels.map(l => [l.level, l]))
  const slots = Array.from({ length: TOP_LEVEL }, (_, i) => {
    const n = i + 1
    if (n === level) return { level: n, kind: 'current', days: p.current?.days ?? 0, began: p.current?.unlockedAt }
    if (n < level) {
      const held = byLevel.get(n)
      if (!held) return { level: n, kind: 'missing' }
      return { level: n, kind: held.break ? 'break' : 'passed', days: held.days, began: held.unlockedAt, standing: standings?.get(n) ?? null }
    }
    return { level: n, kind: ahead ? 'ahead' : 'empty' }
  })
  const breaks = p.levels.filter(l => l.break)
  // Each standing a whole level has reached, with its levels, guru first.
  const standing = LEVEL_STANDINGS.map(({ key }) => [
    key,
    [...(standings ?? [])].filter(([, k]) => k === key).map(([n]) => n).sort((a, b) => a - b)
  ]).filter(([, levels]) => levels.length > 0)
  const quickest = p.levels
    .filter(l => !l.break && l.level > ACCELERATED)
    .reduce((best, l) => (!best || l.days < best.days ? l : best), null)

  const min = fastest ? Math.ceil(fastest / STEP) * STEP : 1
  // Up to 25 days a level, the range a pace is set in: the track was 40,
  // and the part anyone uses was crowded into its first third. It runs
  // further only so your own median and last five always sit on it.
  const max = Math.max(25, Math.ceil(Math.max(p.median ?? 0, p.recent ?? 0)))

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
  // Only the levels reached: WaniKani moves the odd subject to a later level
  // in its content updates, and its answers then land on a level ahead —
  // real, but on this chart a stray block in the future. They still count in
  // the overall figure.
  const rights = rightByLevel ? slots.map(s => (s.level <= level ? rightByLevel.levels[s.level] : null)) : null
  const lowest = rights ? Math.min(1, ...rights.filter(Boolean).map(r => r.share)) : 1
  const floor = Math.min(0.8, Math.floor(lowest * 10) / 10)
  const rightHeight = share => Math.max(4, ((share - floor) / (1 - floor)) * 100)
  // The median's working, or the last five's: their levels, without breaks.
  const kept = p.levels.filter(l => !l.break)
  const recentLevels = kept.slice(-RECENT)
  const worked =
    atMedianMark.at !== null
      ? { ...medianWorking(kept), value: p.median, recent: false }
      : atRecentMark.at !== null
        ? { ...medianWorking(recentLevels), value: p.recent, recent: true }
        : null
  const leftOut = worked?.recent ? breaks.filter(b => b.level > recentLevels[0].level) : breaks
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
    if (event.key === 'Escape') {
      if (reading !== null) point(null)
      else onThrough?.(null)
    }
    if ((event.key === 'Enter' || event.key === ' ') && reading !== null) {
      event.preventDefault()
      chooseThrough(slots[reading])
    }
  }

  // A level ahead, chosen: taught and coverage below say what you would know
  // by then. Choosing it again lets go.
  function chooseThrough(s) {
    if (!onThrough || s.level <= level) return
    onThrough(through === s.level ? null : s.level)
  }

  const at = days => ((days - min) / (max - min)) * 100
  // The marks — median, last five and the goal — as one line under the
  // track, in the order they fall on it. Each once stood at its own place,
  // and two near each other but not near enough to merge printed over each
  // other; a line in order never can.
  const marks = [
    p.median !== null ? { parts: [{ label: `median ${dayCount(toStep(p.median))}`, pointing: atMedianMark }], at: at(p.median) } : null,
    p.recent !== null ? { parts: [{ label: `last five ${dayCount(toStep(p.recent))}`, pointing: atRecentMark }], at: at(p.recent) } : null,
    need !== null ? { parts: [{ label: `goal ${dayCount(need)}`, goal: true }], at: at(need) } : null
  ]
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)


  return (
    <section className="dial">
      <Head right={`level ${level} of ${TOP_LEVEL}${perLevel !== null ? ` · projected at ${dayCount(perLevel)} days a level` : ''}`}>
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
                s.standing ? `all-${s.standing}` : '',
                through && s.level > level && s.level <= through ? 'within' : '',
                reading === i || worked?.middle.some(l => l.level === s.level) ? 'reading' : '',
                onThrough && s.level > level ? 'choosable' : ''
              ]
                .join(' ')
                .trim()}
              {...itemProps(i)}
              onPointerDown={event => {
                chooses.current = event.pointerType === 'mouse' || reading === i
                itemProps(i).onPointerDown(event)
              }}
              onClick={() => {
                if (chooses.current) chooseThrough(s)
                chooses.current = true
              }}
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
      {rightByLevel !== null ? (
        <div className="rights">
          <p className="label">
            <span>right answers on each level’s items, to date</span>
            <span>{rightByLevel ? `${percent(floor)}–100%${rightByLevel.overall !== null ? ` · dashed at your ${percent(rightByLevel.overall)}%` : ''}` : 'reading…'}</span>
          </p>
          <div className="strip" aria-hidden="true" onPointerLeave={event => event.pointerType === 'mouse' && point(null)}>
            {slots.map((s, i) => (
              <span key={s.level} className={[s.kind === 'current' ? 'current' : '', reading === i ? 'reading' : ''].join(' ').trim()} {...itemProps(i)}>
                {rights?.[i] ? <i style={{ height: `${rightHeight(rights[i].share)}%` }} /> : null}
              </span>
            ))}
            {rightByLevel?.overall != null ? <span className="overall" style={{ bottom: `${rightHeight(rightByLevel.overall)}%` }} /> : null}
          </div>
        </div>
      ) : null}

      <div className="under">
        <p className="notes readout" aria-live="polite">
          <span className={shown ? 'usual hidden' : 'usual'}>
            {through ? (
              <>
                <span className="soft">
                  <span className="strong">Through level {through}</span>
                  {ahead ? ` ≈ ${dayMonthYear(through >= TOP_LEVEL ? ahead.done : ahead.startOf(through + 1))}` : ''} · taught and coverage below are as of then
                </span>
                <span className="proj">
                  Projection · once WaniKani has taught you everything through level {through}
                  {counted ? '' : ' · radicals and vocabulary stay at what is taught now'}
                </span>
              </>
            ) : (
              <Hint pointer="Point at" touch="Tap">
                a bar for its level{onThrough ? ', choose one ahead for what you’d know by then,' : ''} or drag the slider to change the pace
              </Hint>
            )}
          </span>
          {shown ? (
            <span className="usual">
              <span className="soft">
                {caption(shown, ahead, perLevel)}
                {rights?.[reading] ? ` · ${percent(rights[reading].share)}% right` : ''}
                {onThrough && shown.level > level ? (
                  <>
                    {' · '}
                    <span className="by-pointer">click</span>
                    <span className="by-touch">tap again</span>
                    {shown.level === through ? ' to let go' : ' for what you’d know by then'}
                  </>
                ) : null}
              </span>
            </span>
          ) : null}
        </p>
        {quickest || breaks.length > 0 || standing.length > 0 ? (
          <p className="notes flags">
            {standing.length > 0 ? (
              <span>
                Every item at least
                {standing.map(([key, levels]) => (
                  <Fragment key={key}>
                    {' · '}
                    <i className={`swatch all-${key}`} aria-hidden="true" />
                    {key} {levels.length === 1 ? 'level' : 'levels'} {runs(levels)}
                  </Fragment>
                ))}
              </span>
            ) : null}
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
          {/* The ends and the marks on the slider's own line: the marks wrap
              under it only where the column is too narrow for them. */}
          <span className="edge start" aria-hidden="true" title={fastest ? 'WaniKani’s fastest' : undefined}>
            {dayCount(min)} days
          </span>
          <span className="edge end" aria-hidden="true">
            {max} days
          </span>
          {marks.length ? (
          <div className="ticks">
            {marks.map((m, n) => (
              <span key={m.parts[0].label} className="mark">
                {m.parts.map(({ label, pointing, goal }, i) => (
                  <Fragment key={label}>
                    {i || n ? ' · ' : ''}
                    {goal ? (
                      <span className="goal" aria-hidden="true">
                        {label}
                      </span>
                    ) : (
                    <span
                      className={pointing.at !== null ? 'working reading' : 'working'}
                      aria-label={`${label} — how it was taken`}
                      {...pointing.groupProps}
                      {...pointing.itemProps(0)}
                      onFocus={() => pointing.point(0)}
                      onKeyDown={event => event.key === 'Escape' && pointing.point(null)}
                    >
                      {label}
                    </span>
                    )}
                  </Fragment>
                ))}
              </span>
            ))}
          </div>
          ) : null}
          {worked ? (
            <p className="notes worked" aria-live="polite">
              <span>
                {worked.recent
                  ? `Your last ${worked.sorted.length === RECENT ? 'five' : worked.sorted.length} levels (${levelSpan(recentLevels)}), quickest first: `
                  : `Median of ${worked.sorted.length} ${worked.sorted.length === 1 ? 'level' : 'levels'}, quickest first: `}
                {worked.sorted.map((l, i) => (
                  <Fragment key={l.level}>
                    {i ? ' · ' : ''}
                    <span className={worked.middle.includes(l) ? 'middle' : undefined}>{dayCount(toStep(l.days))}</span>
                  </Fragment>
                ))}
                {worked.middle.length === 1
                  ? ` — level ${worked.middle[0].level} sits in the middle at ${dayCount(toStep(worked.value))} days`
                  : ` — levels ${worked.middle[0].level} and ${worked.middle[1].level} sit in the middle, averaging ${dayCount(toStep(worked.value))} days`}
                {leftOut.length > 0 ? `, ${leftOut.length === 1 ? 'the break' : 'breaks'} left out` : ''}
              </span>
            </p>
          ) : null}
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
            {/* What the goal asks, on its own line rather than one beneath
                that named the level and the month again. */}
            <span className="answer" aria-live="polite">
              {need === null ? (
                <span className="hot">sooner than WaniKani’s intervals allow</span>
              ) : (
                <span className="soft">
                  <span className="strong">{dayCount(need)} days a level</span> —{' '}
                  {perLevel !== null && perLevel <= need
                    ? 'the dial’s pace gets there'
                    : `${dayCount(toStep(perLevel - need))} faster than the dial`}
                </span>
              )}
            </span>
            {need !== null && need !== perLevel ? (
              <button className="quiet" type="button" onClick={() => onPace(need)}>
                Set the dial to it
              </button>
            ) : null}
          </>
        ) : null}
      </div>

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
// The levels the last five ran over: `13–17`, or each named when a break
// between them was left out.
function levelSpan(levels) {
  const first = levels[0].level
  const last = levels[levels.length - 1].level
  if (levels.length === 1) return String(first)
  return last - first === levels.length - 1 ? `${first}–${last}` : levels.map(l => l.level).join(', ')
}

// Levels as runs: 1–9, 11, 14–15.
function runs(levels) {
  const out = []
  for (const n of levels) {
    const last = out[out.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else out.push([n, n])
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')
}

function caption(s, ahead, perLevel) {
  const began = s.began ? ` · began ${dayMonthYear(s.began)}` : ''
  if (s.kind === 'passed') return `Level ${s.level} · ${Math.round(s.days)} days${began}${s.standing ? ` · every item ${s.standing} or above` : ''}`
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
// In the ahead band beside taught and coverage, which count the same
// things, but on their own clock: the dial and the chosen level move neither.
// The reached ones fold away behind their count. The week's upcoming burns
// that once led it went at the owner's word.
function Milestones({ milestones: m, now }) {
  if (m === undefined) return <Waiting title="milestones" />
  if (!m || (m.next.length === 0 && m.reached.length === 0)) return null
  const reached = m.reached.slice(0, REACHED_SHOWN)

  return (
    <section className="milestones">
      {/* The projection is named in the head — its own clock, not the dial's —
          and the reached dates say whose they are in their fold. */}
      <Head right={m.next.some(n => n.at) ? '≈ last 30 days’ rate' : null}>milestones</Head>
      <div className="body">
        <ul className="ladder">
          {m.next.map((n, i) => (
            <li key={n.kind} className={i === 0 ? 'next soonest' : 'next'}>
              <span className="what">{n.label}</span>
              <span className="when">{n.at ? `≈ ${roughly(n.at, now)}` : ''}</span>
              <span className="togo">{many(n.togo)} to go</span>
            </li>
          ))}
        </ul>
        {reached.length > 0 ? (
          <details className="reached">
            <summary>reached · {reached.length} · WaniKani’s dates</summary>
            <ul className="ladder">
              {reached.map(r => (
                <li key={r.label} className="reached">
                  <span className="what">{r.label}</span>
                  <span className="when">{dayMonthYear(r.at)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
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
      {/* The measure switch sits in the head, as the level's kinds do, rather
          than taking a row of its own. */}
      <Head right={at ? `through level ${at}` : null}>
        coverage
        <span className="kinds" role="group" aria-label="Measure coverage against">
          {MEASURES.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={key === measure} onClick={() => setMeasure(key)}>
              {label}
            </button>
          ))}
        </span>
      </Head>
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
//
// Pointing anywhere on it — hover, or a tap that holds — turns every count
// into its share of the total at once. Each figure stacks its count and its
// share in one cell, as wide as the wider of the two, so the swap moves
// nothing on the line.
function Spread({ spread: bands }) {
  const { at, groupProps, itemProps } = usePointing()
  if (bands.total === 0) return null

  return (
    <div className={at === null ? 'spreadline' : 'spreadline shares'} {...groupProps} {...itemProps(0)}>
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
            {band.key}{' '}
            <span className="figure">
              <span className="count">{many(band.count)}</span>
              <span className="share">{share(band.count, bands.total)}</span>
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}



import { useEffect, useRef, useState } from 'react'
import {
  getLevelAssignments,
  getLevelKanji,
  getLevelRadicals,
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
  leeches,
  levelKanji,
  levelUpKanji,
  milestones,
  moved,
  nextUp,
  pace,
  paceToReach,
  project,
  road,
  srsSystems,
  week
} from '../lib/board.js'
import { glyphFor, pageFor } from '../lib/subject.js'
import { clock, count as many, dayMonthYear, monthYear, roughly, weekday, when } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import { subjectTotals } from '../lib/totals.js'
import { kanjiIndex } from '../lib/kanjiIndex.js'
import { coverage, taughtKanji, throughLevel } from '../lib/coverage.js'
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
      optional(getLevelAssignments(token, user.level))
    ])
    // Coverage's two reads, apart from the rest: the kanji index is the
    // largest read the app makes, and the lists are a chunk of their own, so
    // nothing else on the board waits for either.
    const extra = Promise.all([optional(kanjiIndex(token)), optional(import('../lib/kanjiLists.js'))])

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
          days: week(started, now),
          burns: burnsAhead(started, now),
          spread: spread(started),
          moved: moved(started, now),
          learned: learned(started),
          kanji,
          next: nextUp(kanji, now),
          passed
        }))

        extra.then(([index, lists]) => {
          if (!live) return
          setBoard(held => ({
            ...held,
            coverage: index && lists ? { index, taught: taughtKanji(index, started), lists: { JLPT: lists.JLPT, JOYO: lists.JOYO } } : null
          }))
        })

        return commentary.then(async ([statistics, progressions, totals, systems, onLevel]) => {
          const slipping = statistics ? leeches(statistics, started) : null
          // This level's, for the switch — null, and no switch, if the
          // level's assignments did not come.
          const slippingHere =
            statistics && onLevel
              ? leeches(statistics, started, 5, new Set(onLevel.map(a => a.data.subject_id)))
              : null
          // Only the handful on screen — never a subject sync. Both lists'
          // at most ten, read together so the switch never waits.
          const ids = [...new Set([...(slipping ?? []), ...(slippingHere ?? [])].map(l => l.subjectId))]
          const leechSubjects = ids.length ? await optional(getSubjects(token, ids)) : null
          if (!live) return
          const srs = systems ? srsSystems(systems) : null
          setBoard(held => ({
            ...held,
            totals,
            milestones: milestones(started, now, totals),
            levelUp: srs ? earliestLevelUp(kanji, srs, passed.remaining, now) : null,
            waitingOn: srs ? levelUpKanji(kanji, srs, passed.remaining, now) : [],
            // The level's own system — the accelerated one on levels 1–2.
            fastest: srs ? fastestLevel(srs.get(kanji.find(k => k.system)?.system)) : null,
            accuracy: statistics ? accuracy(statistics) : null,
            slipping: slipping && {
              all: withSubjects(slipping, leechSubjects),
              level: slippingHere && withSubjects(slippingHere, leechSubjects)
            },
            pace: progressions ? pace(progressions, user.level, now) : null
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
          <Figures board={board} level={user.level} />
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
              <Taught learned={board.learned} totals={board.totals} next={board.milestones?.next} />
            </div>
            <div className="column">
              <Slipping slipping={board.slipping} level={user.level} />
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
            milestones={board.milestones}
            burns={board.burns}
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
function Figures({ board, level }) {
  const reviews = dueNow(board.summary)
  const lessons = lessonsWaiting(board.summary)
  // Items whose next review falls in the coming seven days, the backlog
  // included — a look forward, so never called "this week", which reads as
  // reviews already done.
  const thisWeek = board.days.reduce((sum, d) => sum + d.count, 0)
  const { remaining, passed, total } = board.passed

  let toGo
  if (level >= TOP_LEVEL) toGo = [`${passed}/${total}`, `kanji passed · level ${level}`]
  else if (total === 0) toGo = ['–', 'no kanji at this level yet']
  else if (remaining === 0) toGo = ['0', `ready for level ${level + 1}`]
  else toGo = [remaining, `kanji to level ${level + 1}`]

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
      <div className={remaining > 0 || level >= TOP_LEVEL ? 'figure' : 'figure none'}>
        <b>{toGo[0]}</b>
        <span>{toGo[1]}</span>
      </div>
      <div className="figure soft">
        <b>{many(thisWeek)}</b>
        <span>due within 7 days</span>
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
// **The heading switches the grid between the level's kanji and its
// radicals** — two words beside `level 16`, the chosen one lit — rather
// than a fold of radicals under the kanji, which read as one more section
// head. The radicals are read the first time they are asked for.
const KINDS = ['kanji', 'radicals']

function Level({ board, level, token }) {
  const { passed, needed } = board.passed
  const next = board.next
  const onLevel = board.pace?.current?.days
  const [reading, setReading] = useState(null)
  const [showing, setShowing] = useState('kanji')
  const [radicals, setRadicals] = useState(null)

  function readRadicals() {
    setRadicals('reading')
    getLevelRadicals(token, level)
      .then(([subjects, assignments]) => setRadicals(levelKanji(subjects, assignments)))
      .catch(() => setRadicals('failed'))
  }

  function show(kind) {
    setShowing(kind)
    setReading(null)
    if (kind === 'radicals' && (radicals === null || radicals === 'failed')) readRadicals()
  }

  const onRadicals = showing === 'radicals'
  const radicalsPassed = Array.isArray(radicals) ? radicals.filter(r => r.state === 'passed').length : null
  // The count leads the notes rather than sitting in the head, which the
  // switch fills. `20 of 29 passed` read as the level's size, and the grid
  // shows more cells than that: 29 is the 90% WaniKani asks for, so it says
  // needed. The radicals have no threshold; all of them unlock the kanji.
  const count = onRadicals
    ? radicalsPassed !== null
      ? `${radicalsPassed} of ${radicals.length} passed`
      : null
    : `${passed} passed · ${needed} needed`

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
        {!onRadicals ? (
          <Grid items={board.kanji} label={`Level ${level} kanji`} onRead={setReading} />
        ) : radicals === null || radicals === 'reading' ? (
          <p className="notes" role="status">
            <span className="hint">Reading radicals…</span>
          </p>
        ) : radicals === 'failed' ? (
          <p className="notes row hot" role="alert">
            <span>The radicals did not load</span>
            <button className="quiet" type="button" onClick={readRadicals}>
              Try again
            </button>
          </p>
        ) : radicals.length === 0 ? (
          <p className="notes">No radicals at this level</p>
        ) : (
          <Grid items={radicals} label={`Level ${level} radicals`} onRead={setReading} />
        )}
      </div>
      <p className="notes readout" aria-live="polite">
        <span className={reading ? 'usual hidden' : 'usual'}>
          {count ? <span className="soft">{count}</span> : null}
          {onLevel !== undefined ? (
            <span className="soft">Day {Math.floor(onLevel) + 1} on this level</span>
          ) : null}
          {next && !onRadicals ? (
            <span className="soft">
              {/* A handful reads as characters; a batch of a dozen from one
                  lesson session is a wall of them, and the count says more. */}
              {next.kanji.length <= NAMED
                ? next.kanji.map(k => k.characters).join(' ')
                : `${next.kanji.length} kanji`}{' '}
              {next.at ? `up at ${clock(next.at)}` : 'due now'}
              {next.oneStep ? ', one step from passing' : ''}
            </span>
          ) : null}
          <LevelUpLine levelUp={board.levelUp} level={level} />
          <Hint pointer="Point at" touch="Tap">
            {onRadicals ? 'a radical' : 'a kanji'} for its next review,{' '}
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

// One grid of the level's subjects, kanji or radicals. `onRead` hears the
// item under the pointer or the keyboard, and null when both leave.
//
// Each cell links out to its WaniKani page. A mouse clicks through, since
// it reads by hovering; **a finger's first tap reads and its second opens**,
// so tapping for the next review never leaves the board. Enter opens the
// cell the arrows are on. The links stay out of the tab order, which the
// grid already walks as one stop.
const ACROSS = 8

function Grid({ items, label, onRead }) {
  const { at, point, groupProps, itemProps } = usePointing(i => onRead(i === null ? null : items[i]))
  const opens = useRef(true)

  function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ACROSS, ArrowDown: ACROSS }[event.key]
    if (step) {
      event.preventDefault()
      point(at === null ? 0 : Math.min(items.length - 1, Math.max(0, at + step)))
    }
    if (event.key === 'Escape') point(null)
    if (event.key === 'Enter' && items[at]?.url) window.open(items[at].url, '_blank', 'noreferrer')
  }

  return (
    // A list, so browse mode can walk it a cell at a time; each cell's words
    // are text inside it rather than an aria-label, which a plain list item
    // is not reliably read by. `role="list"` because Safari drops the list
    // role from a list styled without bullets.
    <ul className="kanji" role="list" aria-label={label} onKeyDown={key} {...groupProps}>
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

// A projection, and it says so in the same breath: the soonest this level
// could end is only true if nothing is missed from here.
function LevelUpLine({ levelUp, level }) {
  if (!levelUp || level >= TOP_LEVEL) return null
  if (levelUp.waitsOnLocked) return <span>Level {level + 1} waits on locked kanji</span>
  return (
    <span>
      Level {level + 1} earliest {when(levelUp.at)}, if every answer is right
    </span>
  )
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

// The switch reads every level's slips or only this one's — the same five
// lowest, narrowed to what the current level holds. Every level's is first:
// it is the lifetime record, and a level's items are new enough that few of
// them have been missed the three times it takes to count.
function Slipping({ slipping, level }) {
  const [scope, setScope] = useState('all')
  if (slipping === undefined) return <Waiting title="keeps slipping" />
  if (!slipping) return null

  const scopes = [['all', 'all levels'], ['level', `level ${level}`]]
  const onLevel = scope === 'level' && slipping.level
  const items = onLevel ? slipping.level : slipping.all

  return (
    <section>
      <Head>keeps slipping</Head>
      {slipping.level ? (
        <div className="switch" role="group" aria-label="Show what keeps slipping on">
          {scopes.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={key === (onLevel ? 'level' : 'all')} onClick={() => setScope(key)}>
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
        <ul className="slipping">
          {items.map(l => {
            const { text, image } = glyphFor(l.subject.data)
            const meaning = l.subject.data.meanings?.find(m => m.primary)?.meaning
            const reading = l.subject.data.readings?.find(r => r.primary)?.reading
            const page = pageFor(l.subject.data)
            const glyph = text ?? (image ? <img src={image} alt="" /> : '〓')
            return (
              <li key={l.subjectId}>
                {/* Out to WaniKani's page for it, where the mnemonic is. */}
                {page ? (
                  <a className="character" href={page} target="_blank" rel="noreferrer" title="Open on WaniKani">
                    {glyph}
                  </a>
                ) : (
                  <span className="character">{glyph}</span>
                )}
                <span className="what">
                  <span className={`meaning wk-${l.type}`}>{meaning}</span>
                  {reading ? <span className="reading">{reading}</span> : null}
                  {/* The half it is missed on — what to drill. */}
                  {l.weak ? (
                    <span className="weak">
                      {l.weak.half} {l.weak.percentage}%
                    </span>
                  ) : null}
                </span>
                <span className="count">{l.percentage}%</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// 歩 Ahead — the pace dial, then the count milestones and coverage side by
// side: everything on the board that looks forward, in one band. Decided
// from a prototype (the dial, PLAN.md) and regrouped after a design review
// (PLAN.md, "The regrouping"), which found projections scattered over five
// places and the road repeating the dial's decade marks 400px below them.
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

function Ahead({ pace: p, level, now, soonest, fastest, perLevel, onPace, milestones: m, burns, coverage: c }) {
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
      />
      <div className="pair">
        <Milestones milestones={m} burns={burns} now={now} />
        <Coverage coverage={c} level={level} pace={p} now={now} soonest={soonest} perLevel={perLevel} />
      </div>
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
function PaceDial({ pace: p, level, now, soonest, fastest, perLevel, onPace }) {
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
    s.level === level || s === shown || ((s.level === 1 || s.level % 10 === 0) && Math.abs(s.level - level) >= 3)

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
              className={[s.kind, s.level === quickest?.level ? 'fastest' : '', reading === i ? 'reading' : ''].join(' ').trim()}
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
          <span key={s.level} className={s.level === level ? 'hot' : s === shown ? 'soft' : ''}>
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
function Taught({ learned: counts, totals, next = [] }) {
  if (counts.total === 0) return null
  const nextOf = kind => next.find(m => m.kind === kind)

  const all = totals ? totals.radical + totals.kanji + totals.vocabulary : null

  const kinds = [
    ['radical', counts.radical, totals?.radical, 'radicals'],
    ['kanji', counts.kanji, totals?.kanji, 'kanji'],
    ['vocabulary', counts.vocabulary, totals?.vocabulary, 'vocabulary']
  ]

  return (
    <section>
      <Head right={all ? `${share(counts.total, all)} of all wanikani` : null}>taught</Head>
      <div className="fills">
        {kinds.map(([kind, count, total, word]) => (
          <div key={kind} className="kind">
            {/* Without a total there is no track or denominator, so the count
                takes the whole row rather than one cell of three. */}
            <span className={total ? `wk-${kind}` : `wk-${kind} alone`}>
              {many(count)} {word}
            </span>
            {total ? (
              <>
                <span className="of">
                  <span className="soft">{share(count, total)}</span> of {many(total)}
                </span>
                <span className="track" aria-hidden="true">
                  <span
                    className={`fill wk-${kind}`}
                    style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                  />
                  {nextOf(kind) ? (
                    <span className="tick" style={{ left: `${Math.min(100, (nextOf(kind).step / total) * 100)}%` }} />
                  ) : null}
                </span>
              </>
            ) : null}
          </div>
        ))}
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
// taught — and, dragging "through level", how much once WaniKani has taught
// you every kanji through a later level, the gain drawn faint beyond what is
// taught now. That level's date comes from the pace dial, so moving the dial
// moves it.
//
// The share column is as wide as its widest value at any point on the
// slider, worked out up front, so dragging never narrows the hairlines.
const MEASURES = [
  ['JLPT', 'JLPT', 'Unofficial lists — the JLPT stopped publishing them in 2010'],
  ['JOYO', 'Jōyō', 'The 2,136 Jōyō kanji by school grade, as allocated in 2010']
]

function Coverage({ coverage: c, level, pace: p, now, soonest, perLevel }) {
  const [measure, setMeasure] = useState('JLPT')
  const [through, setThrough] = useState(null)
  if (c === undefined) return <Waiting title="coverage" />
  if (!c) return null

  const at = through === null || through <= level ? null : through
  const lists = c.lists[measure]
  const nowRows = coverage(lists, c.taught)
  const thenRows = at ? coverage(lists, throughLevel(c.index, c.taught, at)) : nowRows
  const endRows = coverage(lists, throughLevel(c.index, c.taught, TOP_LEVEL))
  const widest = Math.max(
    ...endRows.map((row, i) => `+${row.have - nowRows[i].have} 100% ${many(row.have)} of ${many(row.total)}`.length)
  )
  // Through level L is when level L+1 begins; through 60, when 60 is done.
  const ahead = at ? project(p, level, perLevel, now, soonest) : null
  const reachedBy = ahead ? (at >= TOP_LEVEL ? ahead.done : ahead.startOf(at + 1)) : null

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
      <div className="slider">
        <input
          id="coverage-through"
          type="range"
          min={level}
          max={TOP_LEVEL}
          step={1}
          value={at ?? level}
          onChange={event => setThrough(Number(event.target.value))}
          aria-label="Coverage through level"
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
            <span className="proj">Projection · once WaniKani has taught you every kanji through level {at}</span>
          </>
        ) : (
          <>
            <span className="hint">Drag the slider to see how much you will know through a later level</span>
            <span className="hint">{MEASURES.find(([key]) => key === measure)[2]}</span>
          </>
        )}
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



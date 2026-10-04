import { useEffect, useRef, useState } from 'react'
import {
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
  earliestLevelUp,
  leeches,
  levelKanji,
  moved,
  nextUp,
  pace,
  road,
  srsSystems,
  week
} from '../lib/board.js'
import { glyphFor } from '../lib/subject.js'
import { stageName } from '../lib/srs.js'
import { subjectTotals } from '../lib/totals.js'
import Forecast from './Forecast.jsx'
import useOnline from './useOnline.js'
import usePointing from './usePointing.js'

// 盤 The board — the whole app. Decided from a prototype: of four
// directions (everything at once, time leads, the level is the page, the
// almanac) and four branches of the first, the original "everything at
// once" was picked. See "The dashboard" in PLAN.md.
//
// A headline row of figures, then three columns: the level, where the
// reviews stand, and what is slipping. The footline is home's forecast.
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
      optional(getSpacedRepetitionSystems(token))
    ])

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
          spread: spread(started),
          moved: moved(started, now),
          learned: learned(started),
          kanji,
          next: nextUp(kanji, now),
          passed
        }))

        return commentary.then(async ([statistics, progressions, totals, systems]) => {
          const slipping = statistics ? leeches(statistics, started) : null
          // Only the handful on screen — never a subject sync.
          const leechSubjects = slipping?.length
            ? await optional(getSubjects(token, slipping.map(l => l.subjectId)))
            : null
          if (!live) return
          setBoard(held => ({
            ...held,
            totals,
            levelUp: systems ? earliestLevelUp(kanji, srsSystems(systems), passed.remaining, now) : null,
            accuracy: statistics ? accuracy(statistics) : null,
            slipping: slipping && withSubjects(slipping, leechSubjects),
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
          <div className="columns">
            <div className="column">
              <Level key={user.level} board={board} level={user.level} token={token} />
            </div>
            <div className="column">
              <Srs spread={board.spread} moved={board.moved} />
              <Taught learned={board.learned} totals={board.totals} />
            </div>
            <div className="column">
              <Slipping slipping={board.slipping} />
              <Pace pace={board.pace} />
            </div>
          </div>
          <Road pace={board.pace} level={user.level} now={board.now} />
        </>
      )}

      {board && !blocking ? (
        <Forecast summary={board.summary} />
      ) : (
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
        <b>{thisWeek.toLocaleString()}</b>
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
// The level's radicals fold away beneath, read only when first opened.
function Level({ board, level, token }) {
  const { passed, needed } = board.passed
  const next = board.next
  const onLevel = board.pace?.current?.days
  const [reading, setReading] = useState(null)
  const [open, setOpen] = useState(false)
  const [radicals, setRadicals] = useState(null)

  function readRadicals() {
    setRadicals('reading')
    getLevelRadicals(token, level)
      .then(([subjects, assignments]) => setRadicals(levelKanji(subjects, assignments)))
      .catch(() => setRadicals('failed'))
  }

  function toggle() {
    setOpen(!open)
    if (!open && (radicals === null || radicals === 'failed')) readRadicals()
  }

  const radicalsPassed = Array.isArray(radicals) ? radicals.filter(r => r.state === 'passed').length : null

  return (
    <section>
      {/* `of` read as the level's size, and the grid beside it shows more
          cells than that: the second number is the 90% WaniKani asks for. */}
      <Head right={`${passed} passed · ${needed} needed`}>level {level} kanji</Head>
      <Grid items={board.kanji} label={`Level ${level} kanji`} onRead={setReading} />
      <p className="notes readout" aria-live="polite">
        <span className={reading ? 'usual hidden' : 'usual'}>
          {onLevel !== undefined ? (
            <span className="soft">day {Math.floor(onLevel) + 1} on this level</span>
          ) : null}
          {next ? (
            <span>
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
          <Hint pointer="point at" touch="tap">
            a kanji for its next review
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
      <button className="quiet fold" type="button" aria-expanded={open} onClick={toggle}>
        <span>
          {open ? '▾' : '▸'} level {level} radicals
        </span>
        {open && radicalsPassed !== null ? <span>{radicalsPassed} of {radicals.length} passed</span> : null}
      </button>
      {open ? (
        radicals === 'reading' ? (
          <p className="notes" role="status">reading radicals</p>
        ) : radicals === 'failed' ? (
          <p className="notes row hot" role="alert">
            <span>the radicals did not load</span>
            <button className="quiet" type="button" onClick={readRadicals}>
              Try again
            </button>
          </p>
        ) : radicals.length === 0 ? (
          <p className="notes">no radicals at this level</p>
        ) : (
          <Grid items={radicals} label={`Level ${level} radicals`} onRead={setReading} />
        )
      ) : null}
    </section>
  )
}

// One grid of the level's subjects, kanji or radicals. `onRead` hears the
// item under the pointer or the keyboard, and null when both leave.
const ACROSS = 8

function Grid({ items, label, onRead }) {
  const { at, point, groupProps, itemProps } = usePointing(i => onRead(i === null ? null : items[i]))

  function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ACROSS, ArrowDown: ACROSS }[event.key]
    if (step) {
      event.preventDefault()
      point(at === null ? 0 : Math.min(items.length - 1, Math.max(0, at + step)))
    }
    if (event.key === 'Escape') point(null)
  }

  return (
    // A list, so browse mode can walk it a cell at a time; each cell's words
    // are text inside it rather than an aria-label, which a plain list item
    // is not reliably read by. `role="list"` because Safari drops the list
    // role from a list styled without bullets.
    <ul className="kanji" role="list" aria-label={label} onKeyDown={key} {...groupProps}>
      {items.map((k, i) => (
        <li key={k.id} className={[k.state, at === i ? 'reading' : ''].join(' ').trim()} {...itemProps(i)}>
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
        </li>
      ))}
    </ul>
  )
}

// When WaniKani next asks for it, read off the assignment — never worked out.
function nextReview(k, now) {
  if (k.state === 'locked') return 'not unlocked yet'
  if (k.state === 'lesson') return 'lesson first'
  if (k.stage === 9) return 'never again'
  if (!k.availableAt) return 'no review scheduled'
  const at = new Date(k.availableAt)
  if (at <= now) return 'review due now'
  return `next review ${when(at)}`
}

// A projection, and it says so in the same breath: the soonest this level
// could end is only true if nothing is missed from here.
function LevelUpLine({ levelUp, level }) {
  if (!levelUp || level >= TOP_LEVEL) return null
  if (levelUp.waitsOnLocked) return <span>level {level + 1} waits on locked kanji</span>
  return (
    <span>
      level {level + 1} earliest {when(levelUp.at)} · if every answer is right
    </span>
  )
}

// Nothing about a grid of characters says pointing at one does anything, so
// the resting notes say so, in the verb the device has. Both are written and
// CSS shows the one that fits — `hover: none` is a finger.
function Hint({ pointer, touch, children }) {
  return (
    <span className="hint">
      <span className="by-pointer">{pointer}</span>
      <span className="by-touch">{touch}</span> {children}
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
      <Head right={`${bands.total.toLocaleString()} started`}>srs spread</Head>
      <Spread spread={bands} />
      <p className="notes row">
        {/* Only the moves WaniKani dates — see `moved` for why master and
            enlightened cannot be here. */}
        {/* `+27 apprentice` read as the apprentice count going up by that;
            it is lessons started, and the guru and burned counts are first
            arrivals. Past, so it says past. */}
        <span className="soft">past 7 days</span>
        <span className="srs-apprentice">{gained.apprentice} started</span>
        <span className="srs-guru">{gained.guru} to guru</span>
        <span className="srs-burned">{gained.burned} burned</span>
      </p>
    </section>
  )
}

function Slipping({ slipping }) {
  if (!slipping) return null

  return (
    <section>
      <Head right="lowest accuracy">keeps slipping</Head>
      {slipping.length === 0 ? (
        <p className="notes">nothing missed often enough to count</p>
      ) : (
        <ul className="slipping">
          {slipping.map(l => {
            const { text, image } = glyphFor(l.subject.data)
            const meaning = l.subject.data.meanings?.find(m => m.primary)?.meaning
            const reading = l.subject.data.readings?.find(r => r.primary)?.reading
            return (
              <li key={l.subjectId}>
                <span className="character">
                  {text ?? (image ? <img src={image} alt="" /> : '〓')}
                </span>
                <span className="what">
                  <span className={`wk-${l.type}`}>{meaning}</span>
                  {reading ? <span className="reading">{reading}</span> : null}
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

// Days per level: every passed level as a bar as tall as it took, this one
// in the accent. A break is a dotted hairline instead — its place kept so
// the levels stay in order, its length kept out of the scale so it cannot
// flatten every other bar — and named beneath, so leaving it out is never
// silent.
//
// A row of bars says nothing about which is which, so the levels are
// numbered beneath — the first, every fifth, and this one, which is as
// many as fit — and **pointing at a bar re-points the caption** to that
// level in words, the way the forecast footline does: no tooltip, the line
// of type that is already there says something more specific. The arrows
// walk it from the keyboard, and the caption is the live region, so a
// screen reader hears what a pointer would show.
// Past DENSE levels the bars outgrow a column: thirty gaps of 4px is a
// third of it gone before any bar is drawn, and a number every fifth level
// runs together. So the gaps close to a pixel and only every tenth level is
// numbered.
const DENSE = 30

function Pace({ pace: p }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  if (!p || (p.levels.length === 0 && !p.current)) return null

  const bars = [...p.levels, ...(p.current ? [{ ...p.current, current: true }] : [])]
  const breaks = p.levels.filter(l => l.break)
  // Scaled by the passed levels alone. A current level already longer than
  // any of them — a break happening now — stops at the top instead of
  // flattening every bar before it.
  const passed = p.levels.filter(l => !l.break).map(l => l.days)
  const tallest = Math.max(1, ...(passed.length ? passed : bars.map(b => b.days)))
  const shown = reading === null ? null : bars[reading]
  // A milestone right beside this level gives way to it — 15 and 16 in
  // adjacent slots read as 1516.
  const dense = bars.length > DENSE
  const every = dense ? 10 : 5
  const near = b => p.current && Math.abs(b.level - p.current.level) < (dense ? 3 : 2)
  const numbered = b =>
    b.current || b === shown || ((b.level === 1 || b.level % every === 0) && !near(b))

  function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
      point(reading === null ? bars.length - 1 : Math.min(bars.length - 1, Math.max(0, reading + step)))
    }
    if (event.key === 'Escape') point(null)
  }

  return (
    <section>
      <Head right={p.median !== null ? `median ${p.median.toFixed(1)}` : null}>days per level</Head>
      <div
        className={dense ? 'bars dense' : 'bars'}
        role="group"
        aria-label="Days spent on each level"
        onKeyDown={key}
        {...groupProps}
      >
        {bars.map((b, i) => (
          <span
            key={b.level}
            className={[b.current ? 'current' : b.break ? 'break' : '', reading === i ? 'reading' : '']
              .join(' ')
              .trim()}
            {...itemProps(i)}
          >
            {/* A level only days old still has to show up as a bar, and one
                running longer than any before it stops at the top. */}
            {b.break ? null : (
              <i style={{ height: `${Math.min(100, Math.max(8, (b.days / tallest) * 100))}%` }} />
            )}
          </span>
        ))}
      </div>
      <div className={dense ? 'levels dense' : 'levels'} aria-hidden="true">
        {bars.map(b => (
          <span key={b.level} className={b.current ? 'hot' : b === shown ? 'soft' : ''}>
            {numbered(b) ? b.level : ''}
          </span>
        ))}
      </div>
      <p className="notes spread-out" aria-live="polite">
        {shown ? (
          <span className="soft">
            level {shown.level} · {shown.current ? `day ${Math.floor(shown.days) + 1} so far` : `${Math.round(shown.days)} days`}
            {shown.break ? ' · break' : ''}
          </span>
        ) : (
          // The day on this level is the level's notes' to say.
          p.eta ? <span className="soft">level 60 ≈ {monthYear(p.eta)}</span> : <span />
        )}
      </p>
      {/* Its own line, and there whether or not a bar is read, so the
          section never changes height under the cursor. */}
      <p className="notes">
        <Hint pointer="point at" touch="tap">
          a bar for its level
        </Hint>
      </p>
      {breaks.length > 0 ? (
        <p className="notes">
          {breaks.length === 1 ? 'level' : 'levels'} {breaks.map(b => b.level).join(', ')} left out as{' '}
          {breaks.length === 1 ? 'a break' : 'breaks'} ·{' '}
          {breaks.map(b => `${Math.round(b.days)}d`).join(', ')}
        </p>
      ) : null}
    </section>
  )
}

// The sixty levels in the six decades WaniKani names — 快 pleasant through
// 現実 reality — as one notched hairline across the page, the walked levels
// lit and this one in the accent. Under each decade, its name and when:
// when you entered it (`from`, or `since` for this one), or a projection at
// the median marked ≈.
// The notches are decoration to a screen reader; the words say it all.
function Road({ pace: p, level, now }) {
  const decades = road(p, level, now)

  return (
    <section className="road">
      <Head right={`level ${level} of ${TOP_LEVEL}`}>the road</Head>
      <ol>
        {decades.map(d => (
          <li key={d.name} className={d.state}>
            <span className="notches" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => {
                const n = d.first + i
                return <i key={n} className={n < level ? 'lit' : n === level ? 'here' : ''} />
              })}
            </span>
            <span className="name">
              <span className="kanji-name">{d.kanji}</span> {d.name}
            </span>
            <span className="when">
              {d.state === 'current'
                ? d.at
                  ? `since ${monthYear(d.at)}`
                  : 'now'
                : d.state === 'done'
                  ? d.at
                    ? `from ${monthYear(d.at)}`
                    : 'done'
                  : d.at
                    ? `≈ ${monthYear(d.at)}`
                    : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Everything taught so far, against how much of it WaniKani has: the count,
// a hairline lit to the share, and the share and the total in words — the
// hairline alone is a length to estimate. The totals are commentary (cached
// a week, and an old copy kept if the refresh fails); without them, the
// bare counts.
function Taught({ learned: counts, totals }) {
  if (counts.total === 0) return null

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
              {count.toLocaleString()} {word}
            </span>
            {total ? (
              <>
                <span className="of">
                  <span className="soft">{share(count, total)}</span> of {total.toLocaleString()}
                </span>
                <span className="track" aria-hidden="true">
                  <span
                    className={`fill wk-${kind}`}
                    style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                  />
                </span>
              </>
            ) : null}
          </div>
        ))}
      </div>
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
            {band.key} {band.count.toLocaleString()}
          </span>
        ))}
      </p>
    </div>
  )
}

function clock(at) {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// A day and an hour, for anything more than a day out; just the hour today.
function when(at) {
  const sameDay = at.toDateString() === new Date().toDateString()
  if (sameDay) return `today ${clock(at)}`
  return `${at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(at)}`
}

function monthYear(at) {
  return at.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

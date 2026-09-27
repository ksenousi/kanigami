import { useEffect, useState } from 'react'
import {
  getLevelKanji,
  getLevelKanjiSubjects,
  getLevelProgressions,
  getReviewStatistics,
  getSpacedRepetitionSystems,
  getStartedAssignments,
  getSubjects,
  getSummary
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
  srsSystems,
  week
} from '../lib/board.js'
import { glyphFor } from '../lib/subject.js'
import { stageName } from '../lib/srs.js'
import { subjectTotals } from '../lib/totals.js'
import Forecast from './Forecast.jsx'
import useOnline from './useOnline.js'

// 盤 The board — the whole app. Decided from a prototype: of four
// directions (everything at once, time leads, the level is the page, the
// almanac) and four branches of the first, the original "everything at
// once" was picked. See "The dashboard" in PLAN.md.
//
// A headline row of figures, then three columns: the level, the week, and
// what is slipping. The footline is home's forecast, unchanged.
//
// It reads and never writes, so it wants a token with no permissions at
// all. Every read happens once, on mount, never on a timer. The four the
// screen cannot stand without fail it together; the rest are commentary —
// statistics, level history, WaniKani's totals, the SRS tables — and
// degrade to null, taking only their own line down with them.
export default function Dashboard({ token, user, onDisconnect }) {
  const [board, setBoard] = useState(null)
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const online = useOnline()

  useEffect(() => {
    let live = true
    setFailure(null)
    const optional = read => read.catch(() => null)

    Promise.all([
      getSummary(token),
      getStartedAssignments(token),
      getLevelKanji(token, user.level),
      getLevelKanjiSubjects(token, user.level),
      optional(getReviewStatistics(token)),
      optional(getLevelProgressions(token)),
      optional(subjectTotals(token)),
      optional(getSpacedRepetitionSystems(token))
    ])
      .then(async ([summary, started, levelAssignments, levelSubjects, statistics, progressions, totals, systems]) => {
        const now = new Date()
        const slipping = statistics ? leeches(statistics, started) : null
        // Only the handful on screen — never a subject sync.
        const leechSubjects = slipping?.length
          ? await optional(getSubjects(token, slipping.map(l => l.subjectId)))
          : null
        if (!live) return
        const kanji = levelKanji(levelSubjects, levelAssignments)
        // The denominator is the level's subjects, not its assignments —
        // see getLevelKanjiSubjects for why those are different numbers.
        const passed = kanjiPassed(levelAssignments, levelSubjects.length)
        setBoard({
          now,
          summary,
          days: week(started, now),
          spread: spread(started),
          moved: moved(started, now),
          learned: learned(started),
          totals,
          kanji,
          next: nextUp(kanji, now),
          passed,
          levelUp: systems ? earliestLevelUp(kanji, srsSystems(systems), passed.remaining, now) : null,
          accuracy: statistics ? accuracy(statistics) : null,
          slipping: slipping && withSubjects(slipping, leechSubjects),
          pace: progressions ? pace(progressions, user.level, now) : null
        })
      })
      .catch(problem => {
        if (live) setFailure(problem)
      })

    return () => {
      live = false
    }
  }, [token, user.level, attempt])

  return (
    <div className="surface-ink board">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="tag">kanigami</span>
        <span className="eyebrow">
          level {user.level} · {user.username}
        </span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      </header>

      {!online ? <p className="eyebrow hot">offline · this app is online only</p> : null}

      {failure ? (
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
              <Level board={board} level={user.level} />
              <Taught learned={board.learned} totals={board.totals} />
            </div>
            <div className="column">
              <Week days={board.days} />
              <Srs spread={board.spread} moved={board.moved} />
            </div>
            <div className="column">
              <Slipping slipping={board.slipping} />
              <Pace pace={board.pace} level={user.level} />
            </div>
          </div>
        </>
      )}

      {board ? (
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
        <span>reviews this week</span>
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
function Level({ board, level }) {
  const { passed, needed, remaining } = board.passed
  const next = board.next
  const onLevel = board.pace?.current?.days

  return (
    <section>
      <Head right={`${passed} of ${needed} passed`}>level {level} kanji</Head>
      <ul className="kanji">
        {board.kanji.map(k => (
          <li key={k.id} className={k.state} aria-label={`${k.characters}, ${k.meaning}: ${describe(k)}`}>
            <span className="character" aria-hidden="true">
              {k.characters}
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
      <p className="notes">
        {remaining > 0 && level < TOP_LEVEL ? (
          <span className="soft">
            {remaining} to level {level + 1}
            {onLevel !== undefined ? ` · day ${Math.floor(onLevel) + 1}` : ''}
          </span>
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
      </p>
    </section>
  )
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

function describe(k) {
  if (k.state === 'locked') return 'locked'
  if (k.state === 'lesson') return 'waiting in lessons'
  if (k.state === 'passed') return `passed, ${stageName(k.stage)}`
  return stageName(k.stage)
}

// Seven days as seven hairlines lit to their share of the busiest. Today
// carries the backlog and the accent.
function Week({ days }) {
  const total = days.reduce((sum, d) => sum + d.count, 0)
  const busiest = Math.max(1, ...days.map(d => d.count))

  return (
    <section>
      <Head right={`${total.toLocaleString()} reviews`}>the next seven days</Head>
      <ul className="days">
        {days.map((d, i) => (
          <li key={d.day.getTime()} className={i === 0 ? 'today' : ''}>
            <span>{i === 0 ? 'today' : dayName(d.day)}</span>
            <span className="track" aria-hidden="true">
              <span className="fill" style={{ width: `${(d.count / busiest) * 100}%` }} />
            </span>
            <span className="count">{d.count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Srs({ spread: bands, moved: gained }) {
  return (
    <section>
      <Head right={`${bands.total.toLocaleString()} started`}>srs spread</Head>
      <Spread spread={bands} />
      <p className="notes row">
        <span className="soft">this week</span>
        <span className="srs-guru">+{gained.guru} guru</span>
        <span className="srs-burned">+{gained.burned} burned</span>
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

// Every passed level as a bar as tall as it took, this one in the accent.
// The caption says the same in words, so the bars are decoration to a
// screen reader.
function Pace({ pace: p, level }) {
  if (!p || (p.levels.length === 0 && !p.current)) return null

  const bars = [...p.levels, ...(p.current ? [{ ...p.current, current: true }] : [])]
  const tallest = Math.max(...bars.map(b => b.days))

  return (
    <section>
      <Head right={p.median !== null ? `median ${p.median.toFixed(1)} days` : null}>pace</Head>
      <div className="bars" aria-hidden="true">
        {bars.map(b => (
          <span
            key={b.level}
            className={b.current ? 'current' : ''}
            // A level only days old still has to show up as a bar.
            style={{ height: `${Math.max(8, (b.days / tallest) * 100)}%` }}
          />
        ))}
      </div>
      <p className="notes spread-out">
        {p.eta ? <span className="soft">60 ≈ {monthYear(p.eta)}</span> : <span />}
        {p.current ? (
          <span className="hot">
            {level} · day {Math.floor(p.current.days) + 1}
          </span>
        ) : null}
      </p>
    </section>
  )
}

// Everything taught so far, against how much of it WaniKani has. The
// denominators are commentary: without them, the bare counts.
function Taught({ learned: counts, totals }) {
  if (counts.total === 0) return null

  const kinds = [
    ['radical', counts.radical, totals?.radical, 'radicals'],
    ['kanji', counts.kanji, totals?.kanji, 'kanji'],
    ['vocabulary', counts.vocabulary, totals?.vocabulary, 'vocabulary']
  ]

  return (
    <section>
      <Head right={totals ? 'of all wanikani' : null}>taught</Head>
      <div className="fills">
        {kinds.map(([kind, count, total, word]) => (
          <div key={kind} className="kind">
            <span className={`wk-${kind}`}>
              {count.toLocaleString()} {word}
            </span>
            {total ? (
              <>
                <span className="track" aria-hidden="true">
                  <span
                    className={`fill wk-${kind}`}
                    style={{ width: `${Math.min(100, (count / total) * 100)}%` }}
                  />
                </span>
                <span className="of">of {total.toLocaleString()}</span>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
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

function dayName(day) {
  return `${day.toLocaleDateString(undefined, { weekday: 'short' })} ${day.getDate()}`
}

function monthYear(at) {
  return at.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

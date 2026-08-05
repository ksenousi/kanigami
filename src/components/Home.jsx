import { useEffect, useState } from 'react'
import {
  getLevelKanji,
  getLevelKanjiCount,
  getStartedAssignments,
  getSummary
} from '../lib/wanikani.js'
import {
  dueNow,
  kanjiPassed,
  learned,
  lessonsWaiting,
  spread,
  startedSince,
  todaysLessons
} from '../lib/standing.js'
import { asPace, readPace, writePace } from '../lib/pace.js'
import Forecast from './Forecast.jsx'
import FaceWarning from './FaceWarning.jsx'
import useFaces from './useFaces.js'
import useOnline from './useOnline.js'

// 家 Home — the ink surface, standing led.
//
// The only screen that answers *which of the two worlds am I entering, and is
// it worth entering now*. There is no router, so it is a state in App.jsx
// rather than a route.
//
// Four reads, once, on mount and never on a timer: the summary carries both
// counts and the forecast, the started assignments carry the spread, and the
// level's kanji take two — the assignments for how many are passed, and a
// count of the level's kanji subjects for how many there are to pass. See
// `getLevelKanjiCount` for why that second one is not the same number.
export default function Home({
  token,
  user,
  onDisconnect,
  onReview,
  onLearn,
  starting,
  error,
  dryRun,
  onDryRun
}) {
  const [standing, setStanding] = useState(null)
  const [failure, setFailure] = useState(null)
  // Bumped to re-run the three reads. A failed load used to offer only the
  // door out, so a dropped connection cost you the token.
  const [attempt, setAttempt] = useState(0)
  // The mirrored daily maximum, see pace.js. Null is no pacing at all.
  const [pace, setPace] = useState(readPace)
  const { faces, settled: facesSettled } = useFaces()
  const online = useOnline()

  useEffect(() => {
    let live = true
    setFailure(null)
    Promise.all([
      getSummary(token),
      getStartedAssignments(token),
      getLevelKanji(token, user.level),
      getLevelKanjiCount(token, user.level)
    ])
      .then(([summary, started, kanji, kanjiTotal]) => {
        if (!live) return
        // Midnight here, because WaniKani's Today's Lessons is a today in
        // the clock on the wall, and this is the moment the counting
        // happens.
        const midnight = new Date()
        midnight.setHours(0, 0, 0, 0)
        setStanding({
          summary,
          spread: spread(started),
          kanji: kanjiPassed(kanji, kanjiTotal),
          // The same collection, counted by kind rather than by stage —
          // and once more by clock, for the lessons already done today.
          learned: learned(started),
          startedToday: startedSince(started, midnight.getTime())
        })
      })
      .catch(problem => {
        if (live) setFailure(problem)
      })
    return () => {
      live = false
    }
  }, [token, user.level, attempt])

  const reviews = standing ? dueNow(standing.summary) : 0
  // Two lesson numbers with two jobs: `waiting` is the queue and opens the
  // door — a spent pace still leaves WaniKani's own "advanced" way in — and
  // `lessons` is the figure, counted the way the dashboard counts it.
  const waiting = standing ? lessonsWaiting(standing.summary) : 0
  const lessons = standing ? todaysLessons(waiting, standing.startedToday, pace) : 0

  // The keyboard gets in without reaching for the mouse. Only when there is
  // somewhere to go, and never while a batch is already loading.
  useEffect(() => {
    function key(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || starting) return
      // Typing into something else should not open a door.
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'r' && reviews > 0) onReview()
      if (event.key === 'l' && waiting > 0) onLearn()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [reviews, waiting, starting, onReview, onLearn])

  return (
    <div className="surface-ink">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="tag">kanigami</span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      </header>

      <div className="centred">
        <div className="eyebrow">
          level {user.level} · {user.username}
        </div>

        {!online ? (
          <p className="eyebrow hot">offline · this app is online only</p>
        ) : null}

        {/* Before the counts, because it is about what the app can do rather
            than about the queue. */}
        <FaceWarning faces={faces} settled={facesSettled} />

        {failure ? (
          // A revoked token and a dropped connection are not the same
          // problem and were being offered the same answer — a button that
          // deletes the token. Only 401 means the token is the thing at
          // fault; everything else gets another go at the same three reads.
          <>
            <p className="error" role="alert">{failure.message}</p>
            {failure.status === 401 ? (
              <button type="button" onClick={onDisconnect}>
                Disconnect
              </button>
            ) : (
              <button type="button" onClick={() => setAttempt(n => n + 1)}>
                Try again
              </button>
            )}
          </>
        ) : !standing ? (
          <div className="eyebrow hot" role="status">reading your queue</div>
        ) : (
          <>
            {/* A count of nothing is dim. Only a number worth acting on gets
                the accent, and only reviews get it at all. */}
            <div className="figures">
              <div className={reviews > 0 ? 'figure due' : 'figure none'}>
                <b>{reviews}</b>
                <span>reviews due</span>
              </div>
              <div className={lessons > 0 ? 'figure' : 'figure none'}>
                <b>{lessons}</b>
                <span>{pace === null ? 'lessons waiting' : 'lessons today'}</span>
              </div>
            </div>

            <Pace
              pace={pace}
              waiting={waiting}
              onPace={next => setPace(writePace(next))}
            />

            <LevelUp kanji={standing.kanji} level={user.level} />

            <Learned learned={standing.learned} />

            <Spread spread={standing.spread} />

            <div className="doors">
              <Door
                label="Review"
                keys="R"
                onClick={onReview}
                enabled={reviews > 0 && !starting && online}
              />
              <Door
                label="Learn"
                keys="L"
                onClick={onLearn}
                enabled={lessons > 0 && !starting && online}
              />
            </div>

            {starting ? <p className="eyebrow hot" role="status">loading</p> : null}
            {error ? <p className="error" role="alert">{error}</p> : null}

            {/* The gate on the write path, covering both doors. It reads as a
                statement of what will happen, because that is the only thing
                about it worth reading. */}
            {/* Only in development — see the note in App.jsx.

                Gated on the build as well as on the prop. `onDryRun` being
                absent is enough to stop it rendering, but the branch is still
                reachable code, so its markup and copy ship in the bundle. The
                literal `import.meta.env.DEV` folds to false at build time and
                the whole block is dropped: the deployed app does not merely
                decline to show a dry-run switch, it does not contain one.

                `dry run · on` read as an instruction to turn it on as easily
                as a statement that it is on, which is a bad ambiguity for the
                one control deciding whether real SRS history gets written.
                The label names the state in words that cannot be read as an
                imperative, and aria-pressed gives it to a screen reader. */}
            {import.meta.env.DEV && onDryRun ? (
              <div className={dryRun ? 'dryrun' : 'dryrun live'}>
                <button
                  className="quiet"
                  type="button"
                  aria-pressed={dryRun}
                  onClick={() => onDryRun(!dryRun)}
                >
                  {dryRun ? 'dry run · nothing is sent' : 'live · writing to wanikani'}
                </button>
                <p className={dryRun ? 'why' : 'why hot'}>
                  {dryRun
                    ? 'Answers are graded and queued for real; the request to WaniKani is logged instead of sent.'
                    : 'Reviews will be submitted and lessons started for real, as items finish. There is no undo for either.'}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {standing ? (
        <Forecast summary={standing.summary} />
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

// The mirrored pace behind the lessons figure. WaniKani's dashboard counts
// Today's Lessons against "maximum recommended daily lessons" — a setting
// its API does not share — so the dashboard's number can only be rebuilt
// from a copy kept here. With a pace, the queue total moves to this line
// and the figure above counts the day; without one there is nothing to say
// but the offer.
//
// The input replaces the button in place: type a maximum, Enter or leave
// commits, empty takes the pace off. Junk changes nothing — a mistype
// should not delete a setting.
function Pace({ pace, waiting, onPace }) {
  const [editing, setEditing] = useState(false)

  function commit(raw) {
    if (String(raw).trim() === '') onPace(null)
    else if (asPace(raw) !== null) onPace(asPace(raw))
    setEditing(false)
  }

  return (
    <p className="pace">
      {pace !== null ? <span>{waiting} waiting</span> : null}
      {editing ? (
        <input
          autoFocus
          inputMode="numeric"
          maxLength={3}
          defaultValue={pace ?? ''}
          aria-label="Daily lesson pace — a copy of WaniKani's maximum recommended daily lessons. Empty for none."
          onBlur={event => commit(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') commit(event.target.value)
          }}
        />
      ) : (
        <button className="quiet" type="button" onClick={() => setEditing(true)}>
          {pace !== null ? `pace · ${pace} a day` : 'set a daily pace'}
        </button>
      )}
    </p>
  )
}

// WaniKani stops at 60. There is no level to count toward from there, so the
// line stops counting rather than promising a level 61.
const TOP_LEVEL = 60

// The one figure that actually moves you up, led by how far off it is.
//
// The denominator is the threshold rather than the level's kanji, so the two
// halves agree: 27 needed less 18 passed is the 9 in front of them. Written
// the other way — `18 of 29 passed · 9 to level 11` — both halves are true
// and they look like an arithmetic error, because the two kanji of slack
// above 90% are nowhere on the line.
function LevelUp({ kanji, level }) {
  if (kanji.total === 0) return <p className="passed">no kanji at this level yet</p>

  // Past the threshold, WaniKani has the level-up and has not announced it
  // yet. Counting to a number already met would read as stuck, and `28 of 27`
  // reads as broken, so this states the position against the whole level
  // instead — which is the one moment that is the interesting number.
  if (kanji.remaining === 0 || level >= TOP_LEVEL) {
    return (
      <p className="passed">
        {/* At 60 the lead is a label rather than an answer, so it stays back
            with the figure. Below it, the answer takes the step forward. */}
        {level >= TOP_LEVEL ? (
          <span>level {level}</span>
        ) : (
          <span className="to">ready for level {level + 1}</span>
        )}
        <span>
          {kanji.passed} of {kanji.total} kanji passed
        </span>
      </p>
    )
  }

  return (
    <p className="passed">
      <span className="to">
        {kanji.remaining} kanji to level {level + 1}
      </span>
      <span>
        {kanji.passed} of {kanji.needed} passed
      </span>
    </p>
  )
}

// Everything taught so far, by kind. WaniKani's subject colours do the
// labelling — this is what they are for, and a line of type is the only place
// the design lets them appear.
function Learned({ learned: counts }) {
  if (counts.total === 0) return null

  return (
    // Gaps rather than · separators, for the reason .counts already uses
    // them: three counts wrap on a narrow screen and strand a dot at the end
    // of the first line. The colours do the separating.
    <p className="learned">
      <span className="wk-radical">{counts.radical} radicals</span>
      <span className="wk-kanji">{counts.kanji} kanji</span>
      <span className="wk-vocabulary">{counts.vocabulary} vocabulary</span>
    </p>
  )
}

// One segmented hairline, and the counts as one line of type beneath it.
// Never five cards with five numbers in them — that is the thing this
// replaces.
function Spread({ spread: bands }) {
  if (bands.total === 0) return null

  return (
    <div className="spreadline">
      <div className="segments" aria-hidden="true">
        {bands.bands
          .filter(band => band.count > 0)
          .map(band => (
            <span
              key={band.key}
              className={`segment srs-${band.key}`}
              style={{ flexGrow: band.count }}
            />
          ))}
      </div>
      {/* Each count wears its band's colour, which is what ties it to the
          segment above — the words are evenly spaced and the segments are
          proportional, so position cannot do that job.

          Laid out with gaps rather than written with · separators: at five
          bands this line wraps on a narrow screen, and a wrapped separator
          strands a dot at the start of the second row. The colours already
          do the separating. */}
      <p className="counts">
        {bands.bands.map(band => (
          <span key={band.key} className={`srs-${band.key}`}>
            {band.key} {band.count}
          </span>
        ))}
      </p>
    </div>
  )
}

// Type over a hairline that lights on hover and focus — the house pattern,
// not a button with a border round it.
function Door({ label, keys, onClick, enabled }) {
  return (
    <button className={enabled ? 'door' : 'door off'} type="button" onClick={onClick} disabled={!enabled}>
      <span className="name">{label}</span>
      <span className="rule" />
      <span className="key">{keys}</span>
    </button>
  )
}

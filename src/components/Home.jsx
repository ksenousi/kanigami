import { useEffect, useState } from 'react'
import { getLevelKanji, getStartedAssignments, getSummary } from '../lib/wanikani.js'
import { dueNow, kanjiPassed, learned, lessonsWaiting, spread } from '../lib/standing.js'
import Forecast from './Forecast.jsx'
import useOnline from './useOnline.js'

// 家 Home — the ink surface, standing led.
//
// The only screen that answers *which of the two worlds am I entering, and is
// it worth entering now*. There is no router, so it is a state in App.jsx
// rather than a route.
//
// Three reads, once, on mount and never on a timer: the summary carries both
// counts and the forecast, the started assignments carry the spread, and the
// level's kanji carry the one figure that actually moves you up a level.
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
  const online = useOnline()

  useEffect(() => {
    let live = true
    setFailure(null)
    Promise.all([getSummary(token), getStartedAssignments(token), getLevelKanji(token, user.level)])
      .then(([summary, started, kanji]) => {
        if (!live) return
        setStanding({
          summary,
          spread: spread(started),
          kanji: kanjiPassed(kanji),
          // The same collection, counted by kind rather than by stage.
          learned: learned(started)
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
  const lessons = standing ? lessonsWaiting(standing.summary) : 0

  // The keyboard gets in without reaching for the mouse. Only when there is
  // somewhere to go, and never while a batch is already loading.
  useEffect(() => {
    function key(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || starting) return
      // Typing into something else should not open a door.
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'r' && reviews > 0) onReview()
      if (event.key === 'l' && lessons > 0) onLearn()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [reviews, lessons, starting, onReview, onLearn])

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
                <span>lessons waiting</span>
              </div>
            </div>

            <p className="passed">
              {standing.kanji.total > 0
                ? `${standing.kanji.passed} of ${standing.kanji.total} kanji passed this level`
                : 'no kanji at this level yet'}
            </p>

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

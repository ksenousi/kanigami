import { useEffect, useState } from 'react'
import { getLevelKanji, getStartedAssignments, getSummary } from '../lib/wanikani.js'
import { dueNow, kanjiPassed, lessonsWaiting, spread } from '../lib/standing.js'
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
  const [failure, setFailure] = useState('')
  const online = useOnline()

  useEffect(() => {
    let live = true
    Promise.all([getSummary(token), getStartedAssignments(token), getLevelKanji(token, user.level)])
      .then(([summary, started, kanji]) => {
        if (!live) return
        setStanding({ summary, spread: spread(started), kanji: kanjiPassed(kanji) })
      })
      .catch(problem => {
        if (live) setFailure(problem.message)
      })
    return () => {
      live = false
    }
  }, [token, user.level])

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
          // Token revoked, or the network went. Either way the way out is the
          // same door the app came in by.
          <>
            <p className="error">{failure}</p>
            <button type="button" onClick={onDisconnect}>
              Reconnect
            </button>
          </>
        ) : !standing ? (
          <div className="eyebrow hot">reading your queue</div>
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

            {starting ? <p className="eyebrow hot">loading</p> : null}
            {error ? <p className="error">{error}</p> : null}

            {/* The gate on the write path, covering both doors. It reads as a
                statement of what will happen, because that is the only thing
                about it worth reading. */}
            <div className="dryrun">
              <button className="quiet" type="button" onClick={() => onDryRun(!dryRun)}>
                {dryRun ? 'dry run · on' : 'dry run · off'}
              </button>
              <p className={dryRun ? 'why' : 'why hot'}>
                {dryRun
                  ? 'Answers are graded and queued for real; the request to WaniKani is logged instead of sent.'
                  : 'Reviews will be submitted and lessons started for real, as items finish. There is no undo for either.'}
              </p>
            </div>
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
      <p className="counts">
        {bands.bands.map(band => `${band.key} ${band.count}`).join(' · ')}
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

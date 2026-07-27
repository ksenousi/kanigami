import { useEffect, useState } from 'react'
import { sessionReport } from '../lib/session.js'
import { getSummary } from '../lib/wanikani.js'
import { acceptedAnswers, glyphFor, subjectTypeName } from '../lib/subject.js'
import Forecast from './Forecast.jsx'

// The end of a session, on the ink surface.
//
// What it says: how much, how accurately, what was missed, and what the queue
// looks like next. What it does not say: well done. There is no confetti, no
// streak, and no score out of five — the items you missed are the useful part
// of a session and they get the room.
//
// The summary is fetched here rather than handed down, because a session just
// changed it. Reading it at the end is the only time it is certainly fresh.
export default function Wrap({ token, session, submitter, onDone, onDisconnect }) {
  const report = sessionReport(session)
  const [summary, setSummary] = useState(null)
  const [sync, setSync] = useState(() => submitter.state())

  useEffect(() => submitter.watch(setSync), [submitter])

  useEffect(() => {
    let live = true
    getSummary(token)
      .then(data => live && setSummary(data))
      .catch(() => {
        // A forecast is the least of what matters here, and the session is
        // already submitted. Losing it silently is the right amount of fuss.
      })
    return () => {
      live = false
    }
  }, [token])

  return (
    <div className="surface-ink">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={onDone}>
          Home
        </button>
      </header>

      <div className="centred">
        <div className="glyph">終</div>

        <p className="eyebrow">
          {report.completed} of {report.total} finished
        </p>

        {/* The session's own spread, in the same grammar as home's: one
            segmented hairline, and the counts beneath it wearing the colours
            of the segments. Celadon and vermilion already mean right and
            wrong everywhere else in the app, so this needed no new colour —
            only the two it has been using all session. */}
        {report.asked > 0 ? (
          <div className="spreadline tally">
            <div className="segments" aria-hidden="true">
              <span className="segment right" style={{ flexGrow: report.correct }} />
              {report.wrong > 0 ? (
                <span className="segment wrong" style={{ flexGrow: report.wrong }} />
              ) : null}
            </div>
            <p className="counts">
              <span className="right">{report.correct} right</span>
              {report.wrong > 0 ? <span className="wrong">{report.wrong} wrong</span> : null}
              <span>{Math.round(report.accuracy * 100)}% of {report.asked}</span>
            </p>
          </div>
        ) : null}

        <p className="lede">{whatBecameOfIt(sync, report)}</p>

        {/* A token revoked mid-session. The way back is the gate, and it is
            offered here rather than taken automatically — leaving this screen
            would take the only record of what did not get sent with it. */}
        {sync.failed.some(failure => failure.status === 401) ? (
          <button type="button" onClick={onDisconnect}>
            Reconnect
          </button>
        ) : null}

        {report.missed.length > 0 ? (
          <div className="missed">
            <p className="eyebrow">missed</p>
            <ul>
              {report.missed.map(item => (
                <li key={item.subjectId}>
                  {/* The glyph takes its subject colour, so the list says
                      what kind of thing you are losing as well as which. */}
                  <span className={`ch wk-${subjectTypeName(item.type)}`}>
                    {glyphFor(item.subject).text ?? '〓'}
                  </span>
                  <span className="gl">{acceptedAnswers(item.subject, 'meaning')[0]}</span>
                  <span className="n">
                    {item.incorrectMeaning + item.incorrectReading}×
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {summary ? (
        <Forecast summary={summary} />
      ) : (
        <div className="footline">
          <span>{sync.dryRun ? 'dry run' : 'submitted'}</span>
          <span className="track" />
          <span>読み書き</span>
        </div>
      )}
    </div>
  )
}

// The one line that says where the answers went. It is the only place a
// session reports that something did not make it.
function whatBecameOfIt(sync, report) {
  if (sync.failed.length > 0) {
    const n = sync.failed.length
    return `${n} ${n === 1 ? 'answer' : 'answers'} could not be sent: ${sync.failed[0].message}`
  }
  if (sync.syncing > 0) {
    return `${sync.syncing} still syncing.`
  }
  if (sync.dryRun) {
    return 'Dry run — every submission was logged to the console instead of sent.'
  }
  if (report.completed === 0) {
    return 'Nothing finished, so nothing was sent.'
  }
  return 'Everything finished has been sent to WaniKani.'
}

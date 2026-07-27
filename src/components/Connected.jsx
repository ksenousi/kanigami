import { useEffect, useState } from 'react'
import { getAvailableLessons, getAvailableReviews, getSummary } from '../lib/wanikani.js'

// Proof the whole chain works end to end: token → API → real counts for this
// account, and a way into a review session. Phase 6 replaces this screen with
// the home surface; until then it is the door.
export default function Connected({
  token,
  user,
  onDisconnect,
  onStartReview,
  onStartLessons,
  starting,
  startError,
  dryRun,
  onDryRun
}) {
  const [counts, setCounts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [reviews, lessons, summary] = await Promise.all([
          getAvailableReviews(token),
          getAvailableLessons(token),
          getSummary(token)
        ])
        if (!live) return
        setCounts({ reviews: reviews.length, lessons: lessons.length, nextAt: nextReviewAt(summary) })
      } catch (problem) {
        if (live) setError(problem.message)
      }
    }
    load()
    return () => {
      live = false
    }
  }, [token])

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
        <div className="eyebrow">level {user.level} · {user.username}</div>

        {error ? <p className="error">{error}</p> : null}

        {counts ? (
          <>
            <div className="figures">
              <div className="figure due">
                <b>{counts.reviews}</b>
                <span>reviews due</span>
              </div>
              <div className="figure">
                <b>{counts.lessons}</b>
                <span>lessons waiting</span>
              </div>
            </div>
            {counts.reviews > 0 || counts.lessons > 0 ? (
              <div className="ways">
                {counts.reviews > 0 ? (
                  <button type="button" onClick={onStartReview} disabled={starting}>
                    {starting ? 'Loading' : 'Review'}
                  </button>
                ) : null}
                {counts.lessons > 0 ? (
                  <button type="button" onClick={onStartLessons} disabled={starting}>
                    {starting ? 'Loading' : 'Learn'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="lede">
                Nothing due. {counts.nextAt ? `Next review ${counts.nextAt}.` : ''}
              </p>
            )}

            {/* The gate on the write path, and it covers both ways in. It
                reads as a statement of what will happen, because that is the
                only thing about it worth reading. */}
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

            {startError ? <p className="error">{startError}</p> : null}
          </>
        ) : (
          !error && <div className="eyebrow hot">reading your queue</div>
        )}
      </div>

      <div className="footline">
        <span>{user.subscription?.active ? `subscribed · max level ${user.subscription.max_level_granted}` : 'free account'}</span>
        <span className="track" />
        <span>online only</span>
      </div>
    </div>
  )
}

// /summary returns hourly buckets for the next 24 hours; the first bucket
// with any subjects in it is the next time something is actually due.
function nextReviewAt(summary) {
  const bucket = summary.reviews?.find(entry => entry.subject_ids.length > 0)
  if (!bucket) return ''
  const when = new Date(bucket.available_at)
  if (when <= new Date()) return 'now'
  return when.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

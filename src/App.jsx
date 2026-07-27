import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Connected from './components/Connected.jsx'
import Review from './components/Review.jsx'
import { getUser, submitReview } from './lib/wanikani.js'
import { loadReviewSession } from './lib/queue.js'
import { createSubmitter } from './lib/submit.js'
import { clearToken, readToken } from './lib/token.js'

export default function App() {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(Boolean(readToken()))
  // A loaded session and its synonyms. There is no router, so which screen
  // the app is on is this being null or not.
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  // On, and it starts on again after every reload. Turning it off is a
  // decision to write to a real account, and that decision does not survive
  // a refresh by accident.
  const [dryRun, setDryRun] = useState(true)

  // A token from a previous visit still has to be proven against the API —
  // it may have been revoked since.
  useEffect(() => {
    if (!token || user) return
    let live = true
    getUser(token)
      .then(data => {
        if (!live) return
        setUser(data)
        setRestoring(false)
      })
      .catch(() => {
        if (!live) return
        clearToken()
        setToken('')
        setRestoring(false)
      })
    return () => {
      live = false
    }
  }, [token, user])

  function disconnect() {
    clearToken()
    setToken('')
    setUser(null)
    setReview(null)
  }

  async function startReview() {
    setLoading(true)
    setLoadError('')
    try {
      const loaded = await loadReviewSession(token)
      if (loaded.session.items.length === 0) {
        setLoadError('Nothing is due right now.')
      } else {
        // The submitter is built here, once per session, because this is the
        // only place that holds both the token and the dry-run decision. The
        // review screen never sees either.
        setReview({
          ...loaded,
          submitter: createSubmitter({
            send: review => submitReview(token, review),
            dryRun
          })
        })
      }
    } catch (problem) {
      setLoadError(problem.message)
    }
    setLoading(false)
  }

  if (restoring) {
    return (
      <div className="surface-ink">
        <div className="centred">
          <div className="eyebrow hot">connecting</div>
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return (
      <TokenGate
        onConnected={(newToken, newUser) => {
          setToken(newToken)
          setUser(newUser)
        }}
      />
    )
  }

  if (review) {
    return (
      <Review
        session={review.session}
        synonyms={review.synonyms}
        submitter={review.submitter}
        onExit={() => setReview(null)}
      />
    )
  }

  return (
    <Connected
      token={token}
      user={user}
      onDisconnect={disconnect}
      onStartReview={startReview}
      starting={loading}
      startError={loadError}
      dryRun={dryRun}
      onDryRun={setDryRun}
    />
  )
}

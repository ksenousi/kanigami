import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Connected from './components/Connected.jsx'
import Review from './components/Review.jsx'
import { getUser } from './lib/wanikani.js'
import { loadReviewSession } from './lib/queue.js'
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
        setReview(loaded)
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
    />
  )
}

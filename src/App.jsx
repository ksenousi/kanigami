import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Dashboard from './components/Dashboard.jsx'
import { getUser } from './lib/wanikani.js'
import { clearToken, readToken } from './lib/token.js'

// Two screens and no router: the token gate until there is a proven token,
// and the board after.
export default function App() {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(Boolean(readToken()))
  const [unreachable, setUnreachable] = useState(null)
  const [attempt, setAttempt] = useState(0)

  // A token from a previous visit still has to be proven against the API —
  // it may have been revoked since. **Only a 401 throws it away.** Anything
  // else — offline, a dropped connection, WaniKani having a bad minute — is
  // not the token's fault, and forgetting it then means pasting 36
  // characters back in on a tablet for no reason.
  useEffect(() => {
    if (!token || user) return
    let live = true
    setUnreachable(null)
    getUser(token)
      .then(data => {
        if (!live) return
        setUser(data)
        setRestoring(false)
      })
      .catch(problem => {
        if (!live) return
        if (problem.status === 401) {
          clearToken()
          setToken('')
          setRestoring(false)
        } else {
          setUnreachable(problem)
        }
      })
    return () => {
      live = false
    }
  }, [token, user, attempt])

  function disconnect() {
    clearToken()
    setToken('')
    setUser(null)
    setUnreachable(null)
    setRestoring(false)
  }

  if (restoring) {
    return (
      <div className="surface-ink">
        {/* The board's masthead, so the page does not jump when it arrives. */}
        <header className="masthead">
          <span className="wordmark">蟹紙</span>
          <span className="tag">kanigami</span>
        </header>
        <div className="centred">
          {unreachable ? (
            <>
              <p className="error" role="alert">
                {unreachable.message}
              </p>
              <button type="button" onClick={() => setAttempt(n => n + 1)}>
                Try again
              </button>
            </>
          ) : (
            <div className="eyebrow hot" role="status">
              connecting
            </div>
          )}
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

  return <Dashboard token={token} user={user} onUser={setUser} onDisconnect={disconnect} />
}

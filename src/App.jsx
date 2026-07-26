import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Connected from './components/Connected.jsx'
import { getUser } from './lib/wanikani.js'
import { clearToken, readToken } from './lib/token.js'

export default function App() {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(Boolean(readToken()))

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

  return <Connected token={token} user={user} onDisconnect={disconnect} />
}

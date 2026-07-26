import { useState } from 'react'
import { getUser } from '../lib/wanikani.js'
import { looksLikeToken, writeToken } from '../lib/token.js'

// First run. One field, one hairline, no chrome — the ink surface from the
// review screen, standing in for it before there is anything to review.
export default function TokenGate({ onConnected }) {
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function connect(event) {
    event.preventDefault()
    const token = value.trim()
    if (!looksLikeToken(token)) {
      setError('That does not look like a WaniKani token. They are 36 characters, dashes included.')
      return
    }
    setChecking(true)
    setError('')
    try {
      const user = await getUser(token)
      writeToken(token)
      onConnected(token, user)
    } catch (problem) {
      setError(problem.message)
      setChecking(false)
    }
  }

  return (
    <div className="surface-ink">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="tag">kanigami</span>
      </header>

      <div className="centred">
        <div className="glyph">墨</div>
        <p className="lede">
          A quiet WaniKani client. Paste a personal access token to begin — it stays in this
          browser and is sent to nobody but WaniKani.{' '}
          <a href="https://www.wanikani.com/settings/personal_access_tokens" target="_blank" rel="noreferrer">
            Make one here
          </a>
          .
        </p>

        <form className="field" onSubmit={connect}>
          <input
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            aria-label="WaniKani personal access token"
            autoComplete="off"
            spellCheck="false"
            disabled={checking}
          />
          <div className="rule" />
        </form>

        {error ? <p className="error">{error}</p> : null}

        <button type="button" onClick={connect} disabled={checking || !value.trim()}>
          {checking ? 'Checking' : 'Connect'}
        </button>
      </div>

      <div className="footline">
        <span>読み書き</span>
        <span className="track" />
        <span>online only</span>
      </div>
    </div>
  )
}

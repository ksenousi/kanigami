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

        {/* The field comes before the permissions block, which is the
            opposite of how this screen used to read. Three paragraphs of
            prose above the only control put the field below the fold on a
            1280×720 laptop — the screen that exists to accept a token showed
            neither the field nor the button, on a dark ground with no
            scrollbar to suggest there was more. The scopes matter while you
            are on WaniKani's settings page choosing them; by the time you
            have a token in the clipboard, the field is what you want. */}
        <form className="field" onSubmit={connect}>
          <input
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            aria-label="WaniKani personal access token"
            aria-describedby={error ? 'token-error' : undefined}
            autoComplete="off"
            spellCheck="false"
            disabled={checking}
          />
          <div className="rule" />
        </form>

        {error ? (
          <p className="error" id="token-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="button" onClick={connect} disabled={checking || !value.trim()}>
          {checking ? 'Checking' : 'Connect'}
        </button>

        <div className="perms">
          <p className="eyebrow">Permissions · two, and only to write</p>
          <ul className="scopes">
            <li>
              <b>reviews:create</b> to submit reviews
            </li>
            <li>
              <b>assignments:start</b> to start lessons
            </li>
          </ul>
          <p className="scopes off">
            study_materials:create · study_materials:update · user:update
          </p>
          {/* This paragraph used to say kanigami wrote nothing until you
              turned its dry run off, and that the two scopes were optional.
              Both were true when the dry run shipped and neither is now: the
              deployed app always submits, so leaving those boxes unchecked
              buys a 403 on every answer rather than safety. */}
          <p className="why">
            Reading needs no permission at all. Check both of the above — kanigami submits each
            review as you finish it, and without them WaniKani refuses the write and your session
            goes unrecorded. Leave the other three unchecked: WaniKani will then refuse those
            writes itself, which is a stronger promise than anything this code can make.
          </p>
        </div>
      </div>

      <div className="footline">
        <span>読み書き</span>
        <span className="track" />
        <span>online only</span>
      </div>
    </div>
  )
}

// The personal access token lives in localStorage on the user's own device
// and is sent to nobody but api.wanikani.com. There is no server here to
// send it to.

const KEY = 'kanigami-token'

export function readToken() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function writeToken(token) {
  try {
    localStorage.setItem(KEY, token.trim())
  } catch {
    // Private browsing with storage disabled — the session still works, it
    // just won't survive a reload.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

// WaniKani personal access tokens are UUIDs. Catching a mistyped token here
// saves a round trip and gives a much better error than a bare 401.
export function looksLikeToken(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

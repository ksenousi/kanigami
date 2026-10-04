// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './lib/wanikani.js'
import App from './App.jsx'
import { button, cleanup, click, render, settle } from './test/dom.js'

vi.mock('./lib/wanikani.js', () => ({ getUser: vi.fn() }))

// The board has its own tests; here it only has to say it was reached.
vi.mock('./components/Dashboard.jsx', () => ({ default: ({ user }) => <p>board for level {user.level}</p> }))

const KEY = 'kanigami-token'
const TOKEN = '00000000-0000-0000-0000-000000000000'
const failure = (message, status) => Object.assign(new Error(message), { status })

async function open() {
  const host = await render(<App />)
  await settle()
  return host
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem(KEY, TOKEN)
})

afterEach(cleanup)

describe('a token from a previous visit', () => {
  it('opens the board once WaniKani accepts it', async () => {
    api.getUser.mockResolvedValue({ username: 'tester', level: 5 })
    const host = await open()
    expect(host.textContent).toContain('board for level 5')
  })

  it('is kept when WaniKani cannot be reached, with a way to try again', async () => {
    api.getUser.mockRejectedValueOnce(failure('WaniKani could not be reached. Check the connection and try again.', 0))
    const host = await open()
    expect(localStorage.getItem(KEY)).toBe(TOKEN)
    expect(host.textContent).toContain('WaniKani could not be reached')

    api.getUser.mockResolvedValue({ username: 'tester', level: 5 })
    await click(button(host, 'Try again'))
    await settle()
    expect(host.textContent).toContain('board for level 5')
  })

  it('is kept through a server error too', async () => {
    api.getUser.mockRejectedValue(failure('WaniKani returned 503.', 503))
    await open()
    expect(localStorage.getItem(KEY)).toBe(TOKEN)
  })

  it('is forgotten only when WaniKani refuses it', async () => {
    api.getUser.mockRejectedValue(failure('That token was rejected.', 401))
    const host = await open()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(host.querySelector('input[type="password"]')).toBeTruthy()
  })
})

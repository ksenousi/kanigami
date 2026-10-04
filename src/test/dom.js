// What the screen tests share: render into a real (jsdom) document, and
// send it the pointer events a mouse or a finger would. React's own `act`
// and nothing else — no testing library to earn its place.
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Newer Node ships an experimental `localStorage` of its own, which without a
// backing file is a stub with no methods, and it shadows jsdom's. The app
// reads storage through the global, so hand it jsdom's.
if (typeof globalThis.localStorage?.clear !== 'function' && typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: jsdom.window.localStorage })
}

const mounted = []

export async function render(element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(element))
  mounted.push({ host, root })
  return host
}

// Call from afterEach, so one test's board does not answer the next one's
// queries.
export async function cleanup() {
  for (const { host, root } of mounted.splice(0)) {
    await act(async () => root.unmount())
    host.remove()
  }
}

// Let pending promises settle — the board's reads are mocked, but they still
// resolve a tick later.
export async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

// jsdom has no PointerEvent. React reads the type and `pointerType` off the
// native event, so a mouse event carrying both is all it needs.
async function send(target, type, pointerType, relatedTarget = null) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  await act(async () => target.dispatchEvent(event))
}

// A mouse arriving over an element from outside, and leaving for outside —
// React builds its enter and leave out of over and out.
export async function hover(target) {
  await send(target, 'pointerover', 'mouse', document.body)
}

export async function unhover(target) {
  await send(target, 'pointerout', 'mouse', document.body)
}

// A finger: the whole burst a tap fires, ending with the leave a touch
// pointer sends as it lifts.
export async function tap(target) {
  await send(target, 'pointerover', 'touch', document.body)
  await send(target, 'pointerdown', 'touch')
  await send(target, 'pointerup', 'touch')
  await send(target, 'pointerout', 'touch', document.body)
}

export async function key(target, name) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })))
}

export async function click(target) {
  await act(async () => target.click())
}

export function button(host, text) {
  return [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
}

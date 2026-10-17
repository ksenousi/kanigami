import { useEffect } from 'react'

// j and k scroll the board, the way they do in a pager; d and u jump to the
// next or previous of its three bands — 今 now, 手元 at hand, 先 ahead —
// rather than half a screen, which lands nowhere in particular. That is all.
//
// Held, the page glides rather than stepping at the keyboard's repeat rate,
// which stutters: a key down sets a speed for the page to ease up to, a key
// up lets it ease back to rest, and a frame loop moves it by the speed
// times the frame's length. A tap gets a head start, so it moves the page
// a short, smooth step rather than a few pixels.
//
// Never while typing in a field, and never with a modifier held, so the
// browser keeps its shortcuts. With reduced motion asked for, each press
// and each repeat is a plain step.
const TOP_SPEED = 1500 // px a second, held
const TAP_SPEED = 900 // px a second, at once — a tap glides about 90px
const EASE = 10 // how fast the speed closes on its target, per second
const STEP = 80 // px a press, with reduced motion
const MARGIN = 16 // px left above a band jumped to

export default function useScrollKeys() {
  useEffect(() => {
    let way = 0 // the key held: 1 for j, -1 for k, 0 for none
    let speed = 0
    let frame = 0
    let last = 0

    function tick(now) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      speed += (way * TOP_SPEED - speed) * Math.min(1, EASE * dt)
      window.scrollBy(0, speed * dt)
      if (way === 0 && Math.abs(speed) < 8) {
        speed = 0
        frame = 0
        return
      }
      frame = requestAnimationFrame(tick)
    }

    function down(event) {
      const key = event.key
      if (!['j', 'k', 'd', 'u'].includes(key)) return
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      event.preventDefault()
      if (key === 'd' || key === 'u') {
        if (event.repeat) return
        way = 0
        speed = 0
        return jump(key === 'd' ? 1 : -1)
      }
      const to = key === 'j' ? 1 : -1
      if (still()) {
        window.scrollBy(0, to * STEP)
        return
      }
      if (event.repeat && way === to) return
      way = to
      if (Math.sign(speed) !== to || Math.abs(speed) < TAP_SPEED) speed = to * TAP_SPEED
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }

    function up(event) {
      if ((event.key === 'j' && way === 1) || (event.key === 'k' && way === -1)) way = 0
    }

    // A key let go in another window never comes back up here.
    const letGo = () => {
      way = 0
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', letGo)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', letGo)
    }
  }, [])
}

// The next band whose top is below the one at the top of the screen, or the
// last one above it; up from the first band is the top of the page.
function jump(way) {
  const tops = [...document.querySelectorAll('.board .band')].map(band => band.getBoundingClientRect().top - MARGIN)
  const to = way > 0 ? tops.find(top => top > 4) : tops.findLast(top => top < -4)
  if (to === undefined && way > 0) return
  window.scrollTo({ top: to === undefined ? 0 : window.scrollY + to, behavior: still() ? 'auto' : 'smooth' })
}

function still() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function typing(el) {
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type)
}

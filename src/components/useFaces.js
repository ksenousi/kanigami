import { useEffect, useState } from 'react'
import { FACES, arrivedFaces } from '../lib/faces.js'

// Which of the four faces this browser actually has, and when to stop asking.
//
// How a face is judged present lives in `faces.js` — `arrivedFaces` — where
// it can be tested without a DOM. Both traps it avoids are written up there:
// `document.fonts.check` lies, and `FontFace.family` does not compare equal
// in Safari. This file owns only the timing, which is the other half of
// getting it right.
//
// **Asking once is not enough, and that shipped broken.** The stylesheet is
// an external `<link>`; a screen can mount before the browser has parsed it,
// and until then `document.fonts` holds no face of these families at all.
// `load()` matches nothing, resolves immediately and successfully, and a
// single probe reads that as four missing fonts — permanently, because an
// effect with no dependencies never runs again. It put the blocked-fonts
// banner on a machine whose fonts were entirely fine.
//
// So it keeps asking: on every `loadingdone`, and on a backoff, until all
// four are in or the deadline passes. Measured against a stylesheet that
// lands after the probe starts, the first attempt finds nothing and the
// retry has all four — Safari 26 at 158ms, Chromium at 405ms. The retry is
// load-bearing in both.
//
// **And it stays quiet until it is sure.** `settled` is false while there is
// still reason to hope, because "the fonts are blocked" is an alarming thing
// to say to somebody whose fonts are merely slow. Reported missing only once
// asking again has stopped being worth it.

// Long enough for a slow network, short enough that somebody whose fonts
// really are blocked is told rather than left wondering.
const GIVE_UP_AFTER = 8000
const RETRY = [150, 400, 900, 1800, 3000]

export default function useFaces() {
  // Optimistic until proven otherwise: all four, so a session starting
  // before the fonts land still varies the face — on system fallbacks, which
  // are real typefaces — rather than collapsing to one and then widening.
  const [state, setState] = useState({ faces: FACES, settled: false })

  useEffect(() => {
    if (!document.fonts?.load) return

    let live = true
    let attempt = 0
    let timer = null
    const startedAt = Date.now()

    function probe() {
      return arrivedFaces(document.fonts).then(here => {
        if (!live) return

        if (here.length === FACES.length) {
          setState({ faces: here, settled: true })
          return
        }

        if (Date.now() - startedAt >= GIVE_UP_AFTER) {
          setState({ faces: here, settled: true })
          return
        }

        const wait = RETRY[Math.min(attempt, RETRY.length - 1)]
        attempt += 1
        timer = setTimeout(probe, wait)
      })
    }

    // Fires whenever the browser finishes a batch of font loading — some of
    // it ours, some of it the stylesheet arriving later than this screen.
    const again = () => probe()
    document.fonts.addEventListener?.('loadingdone', again)
    probe()

    return () => {
      live = false
      clearTimeout(timer)
      document.fonts.removeEventListener?.('loadingdone', again)
    }
  }, [])

  return state
}

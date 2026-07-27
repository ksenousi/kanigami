import { useEffect, useState } from 'react'
import { FACES, available } from '../lib/faces.js'

// Which of the four faces this browser actually has.
//
// The webfonts come from Google, split by unicode-range, so nothing is
// downloaded until something needs a glyph from it — hence the explicit
// `load`, with a kanji rather than the default Latin probe, because the
// Latin subset of a Japanese font is a separate file that can arrive while
// the kanji does not.
//
// **Not `document.fonts.check`.** That was the obvious call and it is the
// wrong one: it answers "could this text be rendered with this font list",
// and the list ends in a fallback, so it returns true for a font that does
// not exist. Measured in a browser — `check("16px 'No Such Face 999'", '山')`
// is `true`. It would have reported all four faces present while the app
// drew one, which is precisely the silent failure this guard is for.
//
// A FontFace's own `status` is the honest signal: 'loaded' once the bytes
// are in, 'error' when they are not coming.
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
// four are in or the deadline passes.
//
// **And it stays quiet until it is sure.** `settled` is false while there is
// still reason to hope, because "the fonts are blocked" is an alarming thing
// to say to somebody whose fonts are merely slow. Reported missing only once
// asking again has stopped being worth it.
const PROBE = '山'

// Long enough for a slow network, short enough that somebody whose fonts
// really are blocked is told rather than left wondering.
const GIVE_UP_AFTER = 8000
const RETRY = [150, 400, 900, 1800, 3000]

const arrived = name =>
  [...document.fonts].some(face => face.family === name && face.status === 'loaded')

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
      return Promise.all(
        FACES.map(face =>
          // A rejection is a font that will not be arriving, which is a fact
          // about this browser rather than an error to report.
          document.fonts.load(`16px '${face.webfont}'`, PROBE).catch(() => null)
        )
      ).then(() => {
        if (!live) return

        const here = available(arrived)
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

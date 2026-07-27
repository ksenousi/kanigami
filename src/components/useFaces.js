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
// Until they resolve the app runs on whatever `available` allows, which is
// at minimum one face. Nothing waits for a network round trip to draw a
// character.
const PROBE = '山'

const arrived = name =>
  [...document.fonts].some(face => face.family === name && face.status === 'loaded')

export default function useFaces() {
  const [faces, setFaces] = useState(FACES)

  useEffect(() => {
    let live = true
    if (!document.fonts?.load) return

    Promise.all(
      FACES.map(face =>
        // A rejection here is a font that will not be arriving, which is a
        // fact about this browser and not an error to report.
        document.fonts.load(`16px '${face.webfont}'`, PROBE).catch(() => null)
      )
    ).then(() => {
      if (!live) return
      setFaces(available(arrived))
    })

    return () => {
      live = false
    }
  }, [])

  return faces
}

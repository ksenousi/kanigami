import { glyphFor } from '../lib/subject.js'

// The character is the interface — nothing else on the screen competes with
// it. A radical with no codepoint falls back to WaniKani's stroke image,
// inverted by the surface so black strokes read on the ink ground.
//
// The image is decorative to a screen reader on purpose: its alt text would
// be the answer to the question being asked.
export default function Glyph({ subject, face }) {
  const { text, image } = glyphFor(subject)

  // Only the character takes the face. A radical drawn as an image has no
  // typeface to vary, and 〓 is the app's own mark rather than the subject's.
  if (text) {
    return (
      <div className="glyph" style={face ? { fontFamily: face.stack } : undefined}>
        {text}
      </div>
    )
  }
  if (image) {
    return (
      <div className="glyph">
        <img src={image} alt="" aria-hidden="true" />
      </div>
    )
  }

  // 〓 is the printer's mark for a character that could not be set, which is
  // exactly what has happened.
  return <div className="glyph">〓</div>
}

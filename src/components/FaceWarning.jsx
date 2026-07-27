import { FACES } from '../lib/faces.js'

// Says so when the typefaces did not arrive.
//
// The shuffle is the feature — a kanji met in one face teaches that picture
// rather than the character — so losing the fonts is losing the thing, not a
// cosmetic downgrade. Without this the app would quietly go back to how it
// worked before and look entirely normal doing it, which is the failure this
// whole feature exists to prevent, arriving by a different door.
//
// A line of type over a hairline rather than a bordered box: a banner in this
// app's language. Nothing here is dismissable, because it is a statement of
// what the app is currently able to do rather than news.
//
// `settled` is the whole reason this does not flash. Fonts are missing for
// the first seconds of every visit — that is what loading is — and saying
// they are blocked in that window is a false alarm that then vanishes,
// which teaches you to ignore the banner the one time it is true.
export default function FaceWarning({ faces, settled }) {
  if (!settled) return null
  const missing = FACES.length - faces.length
  if (missing <= 0) return null

  return (
    <div className="banner" role="status">
      <p className="eyebrow hot">
        {faces.length} of {FACES.length} typefaces
      </p>
      <p className="why">
        {faces.length === 1
          ? 'Kanji are showing in one typeface. Reviews vary the face on purpose, so that you learn the character rather than one drawing of it — that is off until the fonts load.'
          : 'Some typefaces did not load, so reviews are varying between fewer of them than intended.'}{' '}
        They come from Google Fonts; a blocker or a network that refuses it will do this.
      </p>
    </div>
  )
}

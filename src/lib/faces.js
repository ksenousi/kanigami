// The Japanese faces, and which one a given question gets.
//
// A kanji shown in one face only ever teaches that picture. The character is
// what survives across faces — the skeleton — and the styling is the
// typeface having an opinion about it. So the review shuffles and the lesson
// shows the collection: variability where you are tested, comparison where
// you are taught.
//
// Four families, picked to span what you actually meet in Japan rather than
// to be four fonts: gothic on every sign, screen and menu; mincho in books
// and newspapers; Klee for the forms a hand makes; rounded on packaging.
// A fifth candidate, BIZ UDGothic, was dropped — measured against these it
// was the closest pair of the lot, because it is a gothic, so it bought a
// slot and almost no variety.
//
// Each face names a webfont first and a system equivalent after. The
// fallbacks matter: if the webfont does not arrive, `Noto Sans JP` and
// `Noto Serif JP` would both resolve to the same default and the shuffle
// would be four names for one face. `available()` is what stops that.
//
// The system names carry both spellings on purpose. macOS calls them
// `YuMincho` and `YuGothic`; `Yu Mincho` and `Yu Gothic` with spaces are the
// Windows names, and listing only those made the whole stack fall through to
// a generic serif on any Mac without Hiragino.
export const FACES = [
  {
    key: 'gothic',
    label: 'ゴシック',
    webfont: 'Noto Sans JP',
    stack: "'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', YuGothic, 'Yu Gothic', sans-serif"
  },
  {
    key: 'mincho',
    label: '明朝',
    webfont: 'Noto Serif JP',
    stack: "'Noto Serif JP', 'Hiragino Mincho ProN', YuMincho, 'Yu Mincho', serif"
  },
  {
    key: 'kyokasho',
    label: '教科書体',
    webfont: 'Klee One',
    stack: "'Klee One', Klee, YuKyokasho, serif"
  },
  {
    key: 'maru',
    label: '丸ゴシック',
    webfont: 'Zen Maru Gothic',
    stack: "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Tsukushi A Round Gothic', sans-serif"
  }
]

// Which face the nth question is set in.
//
// Rotation rather than a random draw, for two reasons. Every face comes up
// the same number of times, which a random draw only manages on average and
// a short session never sees. And it is a pure function of a number, so the
// screen has nothing to remember and this file has nothing to stub.
//
// Predictable is fine: knowing the next card is a mincho tells you nothing
// about which character is on it.
export function faceFor(n, faces = FACES) {
  if (faces.length === 0) return null
  return faces[((n % faces.length) + faces.length) % faces.length]
}

// The faces that actually arrived, in the order above.
//
// `check` is handed in rather than reached for, so this stays testable and
// stays free of the DOM — the caller passes something that knows how to ask
// the browser. A face with no webfont name is always available, since there
// is nothing that could have failed to load.
//
// Never returns empty: if every webfont is blocked, the first face is kept
// so the glyph still has somewhere to render. A single face is the old
// behaviour, which is a worse app but a working one.
export function available(check, faces = FACES) {
  const arrived = faces.filter(face => !face.webfont || check(face.webfont))
  return arrived.length > 0 ? arrived : faces.slice(0, 1)
}

// A kanji rather than the default Latin probe: these fonts are served split
// by unicode-range, and a family's Latin subset is a separate file that can
// arrive while the kanji does not.
export const PROBE = '山'

// Ask a FontFaceSet which of the four it actually has, and return them.
//
// The set is a parameter for the same reason `available` takes a `check`:
// this file stays free of the DOM and the browser's real `document.fonts` is
// passed in by the hook. What comes back is a promise of the faces present,
// never empty, ready to hand to the screen.
//
// **Read the faces `load()` resolves with — never `FontFace.family`.** The
// resolved array is the whole answer: non-empty means the family is in the
// set and its bytes are in, empty means nothing matched (the stylesheet may
// simply not be parsed yet — that is the caller's cue to ask again), and a
// rejection means the bytes are not coming.
//
// Matching on `family` is the trap, and it shipped: Safari serializes the
// name, so `family` reads `"Noto Sans JP"` with the quote characters in the
// string, while Chrome gives a bare `Noto Sans JP`. Nothing compared equal
// in Safari, so every face looked missing and the collapse-to-one floor
// below took over — the app told people with four working fonts that one had
// arrived. The resolved faces never raise the question.
export function arrivedFaces(fontSet, faces = FACES) {
  return Promise.all(
    faces.map(face =>
      face.webfont
        ? fontSet
            .load(`16px '${face.webfont}'`, PROBE)
            .then(matched => matched.length > 0)
            .catch(() => false)
        : Promise.resolve(true)
    )
  ).then(landed => {
    const here = new Set(faces.filter((_, i) => landed[i]).map(face => face.webfont))
    return available(name => here.has(name), faces)
  })
}

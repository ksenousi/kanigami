// What a subject looks like on screen, as plain data.
//
// This lives in lib rather than in the component because the awkward cases
// are data-shaped, not React-shaped: a radical with no codepoint, a kanji
// whose accepted readings disagree about their type, a vocabulary whose
// readings carry no type at all. The component reads the answer.

const READING_LABELS = {
  onyomi: "on'yomi",
  kunyomi: "kun'yomi",
  nanori: 'nanori'
}

// 'kana_vocabulary' is vocabulary as far as the eye is concerned — the word
// above the glyph and the colour it is set in.
export function subjectTypeName(type) {
  return type === 'kana_vocabulary' ? 'vocabulary' : type
}

// Some radicals have no Unicode character at all. WaniKani ships stroke
// images for those; prefer the SVG, which is the only one that survives being
// scaled to display size.
export function glyphFor(subject) {
  if (subject.characters) return { text: subject.characters, image: null }

  const images = subject.character_images ?? []
  const chosen = images.find(image => image.content_type === 'image/svg+xml') ?? images.at(-1)
  return { text: null, image: chosen?.url ?? null }
}

// Named only when every accepted reading agrees on a type. Anything else —
// including vocabulary, whose readings carry no type — has no honest label,
// and guessing one would be worse than staying quiet.
export function readingTypeLabel(readings) {
  const types = new Set(readings.map(r => r.type))
  return types.size === 1 ? READING_LABELS[[...types][0]] ?? null : null
}

// The line above the glyph, in pieces, because the screen sets them
// differently: what kind of subject this is stays quiet and keeps its subject
// colour, and **what is being asked** is the loud part. The two question types
// used to differ by one word set exactly like every word around it.
export function questionParts(item, questionType) {
  const accepted = acceptedAnswers(item.subject, questionType)
  const readings = (item.subject.readings ?? []).filter(r => r.accepted_answer)

  return {
    kind: subjectTypeName(item.type),
    asked: questionType,
    hint: hintFor(questionType, accepted, readings)
  }
}

// Which reading, and which meaning.
//
// A reading question names the type whenever every accepted reading agrees on
// one — that is the answer to "which". When they disagree there is no which,
// and the useful thing to say is that any of them will do. Same for a word
// with four accepted meanings: WaniKani takes any, and leaving that unsaid is
// what makes a four-meaning vocabulary feel like a guess.
function hintFor(questionType, accepted, readings) {
  if (questionType === 'reading') {
    const label = readingTypeLabel(readings)
    if (label) return label
  }
  return accepted.length > 1 ? `any of ${accepted.length}` : null
}

// The same thing as one string, for anywhere that cannot set the pieces
// apart — a label, a title.
export function questionLine(item, questionType) {
  const { kind, asked, hint } = questionParts(item, questionType)
  return [kind, asked, hint].filter(Boolean).join(' · ')
}

// What to show once the answer has been judged. Only the accepted ones: a
// kanji's other reading is not an answer to the question that was asked.
export function acceptedAnswers(subject, questionType) {
  return questionType === 'reading'
    ? (subject.readings ?? []).filter(r => r.accepted_answer).map(r => r.reading)
    : (subject.meanings ?? []).filter(m => m.accepted_answer).map(m => m.meaning)
}

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

// The line above the glyph: what this is, and what is being asked of it.
export function questionLine(item, questionType) {
  const parts = [subjectTypeName(item.type), questionType]

  if (questionType === 'reading') {
    const accepted = (item.subject.readings ?? []).filter(r => r.accepted_answer)
    const label = readingTypeLabel(accepted)
    if (label) parts.push(label)
  }

  return parts.join(' · ')
}

// What to show once the answer has been judged. Only the accepted ones: a
// kanji's other reading is not an answer to the question that was asked.
export function acceptedAnswers(subject, questionType) {
  return questionType === 'reading'
    ? (subject.readings ?? []).filter(r => r.accepted_answer).map(r => r.reading)
    : (subject.meanings ?? []).filter(m => m.accepted_answer).map(m => m.meaning)
}

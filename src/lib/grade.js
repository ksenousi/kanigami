// The grader.
//
// This is the part people notice. A grader that is wrong five percent of the
// time feels broken, and being wrong in the unfair direction — marking a
// right answer to the other question as a miss — is why third-party clients
// get distrusted. Hence the third verdict: 'retry' is not a soft failure, it
// is the field shaking the answer off without counting it.
//
//   'correct'   — retire the question
//   'incorrect' — count the miss, requeue the question
//   'retry'     — right answer, wrong question; nothing is recorded
//
// `subject` here is a subject's `data` object, which is what the session
// engine hands out as `item.subject`. `kanjiReadings` is the loader's list
// of readings belonging to a single-character vocabulary's component kanji —
// see queue.js — because the one glyph is two subjects, and the kanji's
// reading at the word is a mix-up rather than a miss.

import { isKana, toKana, toRomaji } from 'wanakana'
import { readingTypeLabel } from './subject.js'

export function grade({ subject, questionType, input, synonyms = [], kanjiReadings = [] }) {
  const typed = (input ?? '').trim()
  if (!typed) return { verdict: 'retry', hint: null }

  return questionType === 'reading'
    ? gradeReading(subject, typed, synonyms, kanjiReadings)
    : gradeMeaning(subject, typed, synonyms, kanjiReadings)
}

// Readings are exact. Kana carries no near-misses worth forgiving — a wrong
// vowel is a different word — so there is no typo tolerance here at all.
function gradeReading(subject, typed, synonyms, kanjiReadings) {
  const readings = subject.readings ?? []
  // Lowercase first: wanakana reads uppercase romaji as a request for
  // katakana, and someone typing SAN means さん.
  const kana = toKana(typed.toLowerCase())

  const accepted = readings.filter(r => r.accepted_answer)
  if (accepted.some(r => r.reading === kana)) return { verdict: 'correct', hint: null }

  // The kanji's other reading. The answer is right about the subject and
  // wrong about the question, which is not the same thing as not knowing it.
  if (readings.some(r => !r.accepted_answer && r.reading === kana)) {
    return { verdict: 'retry', hint: wantedReading(accepted) }
  }

  // The kanji's reading at the kanji's word. 人 the vocabulary reads ひと,
  // and にん is right about the character on screen while wrong about the
  // word it is here as — the on'yomi mix-up again, across the two subjects
  // that share the glyph.
  if (kanjiReadings.includes(kana)) {
    return { verdict: 'retry', hint: 'We want the vocabulary reading, not the kanji reading' }
  }

  // The meaning, typed at a reading question. The field converts romaji as
  // it is typed, so English lands here already part-kana — もうんたいn for
  // 'mountain' — and comparing that against readings would grade the
  // keyboard mode, not the answer. Undo the conversion and ask whether it
  // would have passed as a meaning; if it would, this is やま in the meaning
  // box mirrored, and it shakes off the same way.
  const romaji = normalise(toRomaji(kana))
  if (romaji && withinTolerance(romaji, acceptedMeanings(subject, synonyms))) {
    return { verdict: 'retry', hint: 'We want the reading, not the meaning' }
  }

  // Whatever else it is, an answer that is not kana is not a reading, and
  // counting it as a miss would record something the user never said.
  if (![...kana].every(isKana)) {
    return { verdict: 'retry', hint: 'We want the reading, in kana' }
  }

  return { verdict: 'incorrect', hint: null }
}

function wantedReading(accepted) {
  const label = readingTypeLabel(accepted)
  return label ? `WaniKani wants the ${label}` : 'WaniKani wants a different reading'
}

function gradeMeaning(subject, typed, synonyms, kanjiReadings) {
  if ([...typed].some(isKana)) {
    return { verdict: 'retry', hint: 'We want the meaning, not the reading' }
  }

  const answer = normalise(typed)
  if (!answer) return { verdict: 'retry', hint: null }

  // Blacklisted first, and exactly — these exist precisely to stop a wrong
  // word that happens to sit a typo away from a right one from sliding
  // through the tolerance below.
  const blacklist = (subject.auxiliary_meanings ?? [])
    .filter(m => m.type === 'blacklist')
    .map(m => normalise(m.meaning))
  if (blacklist.includes(answer)) return { verdict: 'incorrect', hint: null }

  if (withinTolerance(answer, acceptedMeanings(subject, synonyms))) {
    return { verdict: 'correct', hint: null }
  }

  // Nothing lands as a meaning. Before counting it wrong, check whether it is
  // a reading typed with the keyboard in the wrong mode — やま gets the
  // nudge above, and 'yama' is the same mistake by someone who did not switch
  // scripts. The component kanji's readings count too: 'nin' at 人 the word
  // is a reading twice removed, not a meaning the user does not know.
  // Meanings are tried first, so a synonym that happens to look like a
  // reading is still accepted as the meaning it is.
  const kana = toKana(typed.toLowerCase())
  if ((subject.readings ?? []).some(r => r.reading === kana) || kanjiReadings.includes(kana)) {
    return { verdict: 'retry', hint: 'We want the meaning, not the reading' }
  }

  return { verdict: 'incorrect', hint: null }
}

// What the subject accepts as a meaning: WaniKani's accepted meanings, the
// whitelist beside them, and the user's own synonyms — normalised, because
// everything compared against them is.
function acceptedMeanings(subject, synonyms) {
  return [
    ...(subject.meanings ?? []).filter(m => m.accepted_answer).map(m => m.meaning),
    ...(subject.auxiliary_meanings ?? []).filter(m => m.type === 'whitelist').map(m => m.meaning),
    ...synonyms
  ]
    .map(normalise)
    .filter(Boolean)
}

function withinTolerance(answer, candidates) {
  return candidates.some(candidate => distance(answer, candidate) <= tolerance(candidate))
}

// Both sides of the comparison go through this, so "To Eat" matches "eat"
// and "the sun" matches "sun".
function normalise(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:a|an|the) /, '')
    .replace(/^to /, '')
}

// How far off an answer may be, scaled by the length of the meaning it is
// being compared against: none at all for short words, where a single letter
// is usually a different word, and one more edit for every seven characters
// after that.
function tolerance(answer) {
  if (answer.length <= 3) return 0
  if (answer.length <= 5) return 1
  if (answer.length <= 7) return 2
  return 2 + Math.ceil((answer.length - 7) / 7)
}

// Levenshtein, one row at a time.
function distance(a, b) {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1)
    }
    previous = current
  }

  return previous[b.length]
}

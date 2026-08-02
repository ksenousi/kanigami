import { describe, expect, it } from 'vitest'
import { grade } from './grade.js'

// Subject fixtures in the shape the session engine hands out — a subject
// resource's `data`, trimmed to the fields the grader reads. Meanings arrive
// from the API title-cased, which is worth keeping here rather than tidying.

const mountain = {
  characters: '山',
  meanings: [{ meaning: 'Mountain', primary: true, accepted_answer: true }],
  auxiliary_meanings: [],
  readings: [
    { type: 'onyomi', primary: true, reading: 'さん', accepted_answer: true },
    { type: 'kunyomi', primary: false, reading: 'やま', accepted_answer: false }
  ]
}

const above = {
  characters: '上',
  meanings: [
    { meaning: 'Above', primary: true, accepted_answer: true },
    { meaning: 'Up', primary: false, accepted_answer: true },
    { meaning: 'Over', primary: false, accepted_answer: false }
  ],
  auxiliary_meanings: [{ meaning: 'Upper', type: 'whitelist' }],
  readings: [
    { type: 'onyomi', primary: true, reading: 'じょう', accepted_answer: true },
    { type: 'kunyomi', primary: false, reading: 'うえ', accepted_answer: false }
  ]
}

// 'male' sits two edits from the whitelisted 'female', which is inside the
// tolerance for a six-letter answer. This is exactly what the blacklist is
// for, and the case the grader has to get right.
const woman = {
  characters: '女',
  meanings: [{ meaning: 'Woman', primary: true, accepted_answer: true }],
  auxiliary_meanings: [
    { meaning: 'Female', type: 'whitelist' },
    { meaning: 'Male', type: 'blacklist' }
  ],
  readings: [
    { type: 'onyomi', primary: true, reading: 'じょ', accepted_answer: true },
    { type: 'kunyomi', primary: false, reading: 'おんな', accepted_answer: false }
  ]
}

const sun = {
  characters: '日',
  meanings: [
    { meaning: 'Sun', primary: true, accepted_answer: true },
    { meaning: 'Day', primary: false, accepted_answer: true }
  ],
  auxiliary_meanings: [{ meaning: 'Sunday', type: 'blacklist' }],
  readings: [
    { type: 'onyomi', primary: true, reading: 'にち', accepted_answer: true },
    { type: 'kunyomi', primary: false, reading: 'ひ', accepted_answer: false }
  ]
}

// Vocabulary readings carry no on'yomi/kun'yomi type, so the nudge for one
// falls back to the generic phrasing.
const skill = {
  characters: '上手',
  meanings: [{ meaning: 'Skill', primary: true, accepted_answer: true }],
  auxiliary_meanings: [{ meaning: 'Good At', type: 'whitelist' }],
  readings: [
    { primary: true, reading: 'じょうず', accepted_answer: true },
    { primary: false, reading: 'うわて', accepted_answer: false }
  ]
}

// The same subject as the API would send it if vocabulary readings ever
// carried a type. Anything outside on'yomi/kun'yomi/nanori has to fall
// through to the generic nudge, whatever the field actually holds.
const skillTyped = {
  ...skill,
  readings: skill.readings.map(r => ({ ...r, type: 'vocabulary' }))
}

const toEat = {
  characters: '食べる',
  meanings: [{ meaning: 'To Eat', primary: true, accepted_answer: true }],
  auxiliary_meanings: [],
  readings: [{ primary: true, reading: 'たべる', accepted_answer: true }]
}

// A single-character word sharing its glyph with a kanji. The loader hands
// the grader that kanji's readings as `kanjiReadings`, so the word's reading
// question can shake off the kanji's — にん is right about 人 the character
// and wrong about 人 the word.
const person = {
  characters: '人',
  meanings: [{ meaning: 'Person', primary: true, accepted_answer: true }],
  auxiliary_meanings: [],
  readings: [{ primary: true, reading: 'ひと', accepted_answer: true }]
}
const personKanji = ['にん', 'じん', 'ひと', 'と']

// A radical: meaning only, and no readings field at all.
const lid = {
  characters: '亠',
  meanings: [{ meaning: 'Lid', primary: true, accepted_answer: true }],
  auxiliary_meanings: []
}

// One subject per typo-tolerance band, chosen for the length of the answer.
const oneWord = (characters, meaning) => ({
  characters,
  meanings: [{ meaning, primary: true, accepted_answer: true }],
  auxiliary_meanings: []
})
const water = oneWord('水', 'Water') // 5 — band 1
const friend = oneWord('友', 'Friend') // 6 — band 2
const construction = oneWord('工', 'Construction') // 12 — band 3
const student = oneWord('大学生', 'University Student') // 18 — band 4

const forType = questionType => cases => cases.map(c => ({ ...c, questionType }))
const readings = forType('reading')
const meanings = forType('meaning')

function check({ subject, questionType, input, synonyms, kanjiReadings, verdict, hint = null }) {
  expect(grade({ subject, questionType, input, synonyms, kanjiReadings })).toEqual({ verdict, hint })
}

const ONYOMI = "WaniKani wants the on'yomi"
const OTHER_READING = 'WaniKani wants a different reading'
const NOT_THE_READING = 'We want the meaning, not the reading'
const NOT_THE_MEANING = 'We want the reading, not the meaning'
const KANJI_READING = 'We want the vocabulary reading, not the kanji reading'
const IN_KANA = 'We want the reading, in kana'

describe('readings', () => {
  it.each(
    readings([
      { name: '山 さん', subject: mountain, input: 'さん', verdict: 'correct' },
      { name: '山 typed as romaji', subject: mountain, input: 'san', verdict: 'correct' },
      { name: '山 typed as uppercase romaji', subject: mountain, input: 'SAN', verdict: 'correct' },
      { name: '山 with stray whitespace', subject: mountain, input: '  さん ', verdict: 'correct' },
      { name: '山 やま — the kun\'yomi', subject: mountain, input: 'やま', verdict: 'retry', hint: ONYOMI },
      { name: '山 yama as romaji', subject: mountain, input: 'yama', verdict: 'retry', hint: ONYOMI },
      { name: '山 a reading it does not have', subject: mountain, input: 'し', verdict: 'incorrect' },
      { name: '山 nothing typed', subject: mountain, input: '', verdict: 'retry' },
      { name: '上 じょう', subject: above, input: 'じょう', verdict: 'correct' },
      { name: '上 うえ', subject: above, input: 'うえ', verdict: 'retry', hint: ONYOMI },
      { name: '女 おんな', subject: woman, input: 'onna', verdict: 'retry', hint: ONYOMI },
      { name: '食べる たべる', subject: toEat, input: 'たべる', verdict: 'correct' },
      { name: '食べる as romaji', subject: toEat, input: 'taberu', verdict: 'correct' },
      { name: '食べる wrong ending — no partial credit', subject: toEat, input: 'たべます', verdict: 'incorrect' },
      { name: '食べる one kana short', subject: toEat, input: 'たべ', verdict: 'incorrect' },
      { name: '上手 じょうず', subject: skill, input: 'じょうず', verdict: 'correct' },
      { name: '上手 うわて — untyped vocabulary reading', subject: skill, input: 'うわて', verdict: 'retry', hint: OTHER_READING },
      { name: '上手 うわて — an unexpected reading type', subject: skillTyped, input: 'うわて', verdict: 'retry', hint: OTHER_READING },
      { name: '上手 じょうず with an unexpected reading type', subject: skillTyped, input: 'じょうず', verdict: 'correct' }
    ])
  )('$name', check)
})

describe('meanings', () => {
  it.each(
    meanings([
      { name: '山 mountain', subject: mountain, input: 'mountain', verdict: 'correct' },
      { name: '山 capitalised', subject: mountain, input: 'Mountain', verdict: 'correct' },
      { name: '山 with stray whitespace', subject: mountain, input: '  mountain  ', verdict: 'correct' },
      { name: '山 something else entirely', subject: mountain, input: 'river', verdict: 'incorrect' },
      { name: '山 kana in the meaning box', subject: mountain, input: 'やま', verdict: 'retry', hint: NOT_THE_READING },
      { name: '山 katakana in the meaning box', subject: mountain, input: 'サン', verdict: 'retry', hint: NOT_THE_READING },
      { name: '山 nothing typed', subject: mountain, input: '   ', verdict: 'retry' },
      { name: '上 the secondary meaning', subject: above, input: 'up', verdict: 'correct' },
      { name: '上 a meaning WaniKani does not accept', subject: above, input: 'over', verdict: 'incorrect' },
      { name: '上 a whitelisted meaning', subject: above, input: 'upper', verdict: 'correct' },
      { name: '女 woman', subject: woman, input: 'woman', verdict: 'correct' },
      { name: '女 the whitelisted female', subject: woman, input: 'female', verdict: 'correct' },
      { name: '女 male — blacklisted, and a typo away from female', subject: woman, input: 'male', verdict: 'incorrect' },
      { name: '日 sunday — blacklisted outright', subject: sun, input: 'Sunday', verdict: 'incorrect' },
      { name: '日 day', subject: sun, input: 'day', verdict: 'correct' },
      { name: '亠 a radical', subject: lid, input: 'lid', verdict: 'correct' },
      { name: '亠 kana for a radical', subject: lid, input: 'ふた', verdict: 'retry', hint: NOT_THE_READING },
      { name: '上手 a whitelisted phrase', subject: skill, input: 'good at', verdict: 'correct' }
    ])
  )('$name', check)
})

describe('normalisation', () => {
  it.each(
    meanings([
      { name: 'a verb without its leading to', subject: toEat, input: 'eat', verdict: 'correct' },
      { name: 'a verb with its leading to', subject: toEat, input: 'to eat', verdict: 'correct' },
      { name: 'inner whitespace collapsed', subject: toEat, input: 'to   eat', verdict: 'correct' },
      { name: 'a leading article', subject: sun, input: 'the sun', verdict: 'correct' },
      { name: 'a leading indefinite article', subject: friend, input: 'a friend', verdict: 'correct' },
      { name: 'to as a whole answer is not stripped away', subject: toEat, input: 'to', verdict: 'incorrect' }
    ])
  )('$name', check)
})

// Typing the reading when the meaning was asked is the same mistake whether
// the keyboard was in kana mode or not.
describe('the reading typed into a meaning box', () => {
  it.each(
    meanings([
      { name: '山 as romaji kun\'yomi', subject: mountain, input: 'yama', verdict: 'retry', hint: NOT_THE_READING },
      { name: '山 as romaji on\'yomi', subject: mountain, input: 'san', verdict: 'retry', hint: NOT_THE_READING },
      { name: '食べる as romaji', subject: toEat, input: 'taberu', verdict: 'retry', hint: NOT_THE_READING },
      { name: 'a reading that is not this subject\'s', subject: mountain, input: 'kawa', verdict: 'incorrect' },
      { name: 'an ordinary wrong answer', subject: mountain, input: 'river', verdict: 'incorrect' },
      // Meanings are checked first, so a user who adds a romaji synonym gets
      // it accepted rather than nudged.
      { name: 'a romaji synonym the user added', subject: mountain, input: 'yama', synonyms: ['yama'], verdict: 'correct' },
      // A blacklisted answer is still rejected, whatever it converts to.
      { name: 'a blacklisted answer that converts to kana', subject: woman, input: 'male', verdict: 'incorrect' }
    ])
  )('$name', check)
})

// The mirror of the block above. The review field converts romaji as it is
// typed, so English arrives at the grader already part-kana — もうんたいn is
// what the field actually holds after someone types 'mountain' — and the raw
// romaji covers the grader called on its own.
describe('the meaning typed into a reading box', () => {
  it.each(
    readings([
      { name: '山 the meaning, raw', subject: mountain, input: 'mountain', verdict: 'retry', hint: NOT_THE_MEANING },
      { name: '山 the meaning as the field holds it', subject: mountain, input: 'もうんたいn', verdict: 'retry', hint: NOT_THE_MEANING },
      { name: '山 the meaning with a typo', subject: mountain, input: 'mauntain', verdict: 'retry', hint: NOT_THE_MEANING },
      { name: '山 a user synonym', subject: mountain, input: 'peak', synonyms: ['peak'], verdict: 'retry', hint: NOT_THE_MEANING },
      // すん is clean kana, so only the round trip back to romaji can tell
      // that it started as English.
      { name: '日 a meaning that converts to clean kana', subject: sun, input: 'sun', verdict: 'retry', hint: NOT_THE_MEANING },
      // Not kana, not a meaning — there is nothing here to grade, only the
      // keyboard mode to point at.
      { name: '山 a wrong word that will not convert', subject: mountain, input: 'river', verdict: 'retry', hint: IN_KANA },
      // Kana through and through stays gradable: a wrong reading in the
      // right script is a real miss.
      { name: '山 a wrong reading in kana still counts', subject: mountain, input: 'かわ', verdict: 'incorrect' }
    ])
  )('$name', check)
})

// One glyph, two subjects. The kanji's reading typed at the single-character
// word is right about the character and wrong about the word — WaniKani
// shakes it off, and so does this, when the loader has supplied the
// component kanji's readings.
describe('the kanji reading typed at its vocabulary', () => {
  it.each([
    ...readings([
      { name: '人 ひと', subject: person, kanjiReadings: personKanji, input: 'ひと', verdict: 'correct' },
      { name: '人 にん — the kanji reading', subject: person, kanjiReadings: personKanji, input: 'にん', verdict: 'retry', hint: KANJI_READING },
      { name: '人 jin as romaji', subject: person, kanjiReadings: personKanji, input: 'jin', verdict: 'retry', hint: KANJI_READING },
      // Without the loader's list there is nothing to recognise, and the
      // answer grades as the miss it would otherwise be.
      { name: '人 にん with no kanji readings in hand', subject: person, input: 'にん', verdict: 'incorrect' },
      { name: '人 something else entirely', subject: person, kanjiReadings: personKanji, input: 'かわ', verdict: 'incorrect' }
    ]),
    ...meanings([
      { name: '人 person', subject: person, kanjiReadings: personKanji, input: 'person', verdict: 'correct' },
      // The same mix-up in the other box gets the other box's nudge.
      { name: '人 nin in the meaning box', subject: person, kanjiReadings: personKanji, input: 'nin', verdict: 'retry', hint: NOT_THE_READING }
    ])
  ])('$name', check)
})

describe('typo tolerance', () => {
  it.each(
    meanings([
      { name: 'three letters forgive nothing', subject: sun, input: 'sum', verdict: 'incorrect' },
      { name: 'three letters, typed right', subject: sun, input: 'sun', verdict: 'correct' },
      { name: 'five letters forgive one edit', subject: water, input: 'watar', verdict: 'correct' },
      { name: 'five letters forgive a dropped letter', subject: water, input: 'watr', verdict: 'correct' },
      { name: 'five letters do not forgive two', subject: water, input: 'wtaer', verdict: 'incorrect' },
      { name: 'six letters forgive a transposition', subject: friend, input: 'freind', verdict: 'correct' },
      { name: 'six letters forgive two dropped letters', subject: friend, input: 'frnd', verdict: 'correct' },
      { name: 'six letters do not forgive three', subject: friend, input: 'frnds', verdict: 'incorrect' },
      { name: 'twelve letters forgive three edits', subject: construction, input: 'construcshun', verdict: 'correct' },
      { name: 'twelve letters do not forgive four', subject: construction, input: 'construkshun', verdict: 'incorrect' },
      { name: 'eighteen letters forgive four edits', subject: student, input: 'univrsty stdnt', verdict: 'correct' },
      { name: 'eighteen letters do not forgive five', subject: student, input: 'unvrsty stdnt', verdict: 'incorrect' },
      { name: 'a different word is not a typo', subject: student, input: 'college student', verdict: 'incorrect' }
    ])
  )('$name', check)
})

describe('user synonyms', () => {
  it.each(
    meanings([
      { name: 'a synonym from study materials', subject: mountain, input: 'peak', synonyms: ['peak'], verdict: 'correct' },
      { name: 'a synonym with a typo in it', subject: mountain, input: 'peek', synonyms: ['peak'], verdict: 'correct' },
      { name: 'the same word without the synonym', subject: mountain, input: 'peak', verdict: 'incorrect' },
      { name: 'the real meaning still passes', subject: mountain, input: 'mountain', synonyms: ['peak'], verdict: 'correct' },
      // A blacklisted answer stays rejected however it arrives — the plan
      // says reject outright, and WaniKani will not accept it either.
      { name: 'a synonym that is blacklisted', subject: woman, input: 'male', synonyms: ['male'], verdict: 'incorrect' }
    ])
  )('$name', check)
})

describe('the shape of the result', () => {
  it('always returns a verdict and a hint', () => {
    const result = grade({ subject: mountain, questionType: 'meaning', input: 'mountain' })
    expect(Object.keys(result).sort()).toEqual(['hint', 'verdict'])
  })

  it('tolerates a missing input', () => {
    expect(grade({ subject: mountain, questionType: 'meaning' })).toEqual({
      verdict: 'retry',
      hint: null
    })
  })
})

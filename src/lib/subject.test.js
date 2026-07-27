import { describe, expect, it } from 'vitest'
import {
  acceptedAnswers,
  glyphFor,
  questionLine,
  questionParts,
  readingTypeLabel,
  subjectTypeName
} from './subject.js'

// Hand-authored, minimal, and fake. Never paste a live API payload in here.
const mountain = {
  characters: '山',
  meanings: [
    { meaning: 'Mountain', accepted_answer: true },
    { meaning: 'Hill', accepted_answer: false }
  ],
  readings: [
    { reading: 'さん', accepted_answer: true, type: 'onyomi' },
    { reading: 'やま', accepted_answer: false, type: 'kunyomi' }
  ]
}

const above = {
  characters: '上',
  meanings: [{ meaning: 'Above', accepted_answer: true }],
  readings: [
    { reading: 'じょう', accepted_answer: true, type: 'onyomi' },
    { reading: 'うえ', accepted_answer: true, type: 'kunyomi' }
  ]
}

const skill = {
  characters: '上手',
  meanings: [{ meaning: 'Skill', accepted_answer: true }],
  readings: [{ reading: 'じょうず', accepted_answer: true }]
}

const drawnRadical = {
  characters: null,
  character_images: [
    { url: 'https://example.invalid/lid.png', content_type: 'image/png' },
    { url: 'https://example.invalid/lid.svg', content_type: 'image/svg+xml' }
  ],
  meanings: [{ meaning: 'Lid', accepted_answer: true }]
}

const item = (type, subject) => ({ type, subject })

describe('subjectTypeName', () => {
  it('passes the three real types through', () => {
    expect(subjectTypeName('radical')).toBe('radical')
    expect(subjectTypeName('kanji')).toBe('kanji')
    expect(subjectTypeName('vocabulary')).toBe('vocabulary')
  })

  it('reads kana_vocabulary as vocabulary', () => {
    expect(subjectTypeName('kana_vocabulary')).toBe('vocabulary')
  })
})

describe('glyphFor', () => {
  it('uses the character when there is one', () => {
    expect(glyphFor(mountain)).toEqual({ text: '山', image: null })
  })

  it('prefers the SVG over the raster for a radical with no codepoint', () => {
    expect(glyphFor(drawnRadical)).toEqual({
      text: null,
      image: 'https://example.invalid/lid.svg'
    })
  })

  it('falls back to the last image when none of them is an SVG', () => {
    const raster = {
      characters: null,
      character_images: [
        { url: 'https://example.invalid/small.png', content_type: 'image/png' },
        { url: 'https://example.invalid/large.png', content_type: 'image/png' }
      ]
    }
    expect(glyphFor(raster).image).toBe('https://example.invalid/large.png')
  })

  it('reports nothing to draw rather than throwing', () => {
    expect(glyphFor({ characters: null })).toEqual({ text: null, image: null })
  })
})

describe('readingTypeLabel', () => {
  it('names the type when every reading agrees', () => {
    expect(readingTypeLabel([{ type: 'onyomi' }, { type: 'onyomi' }])).toBe("on'yomi")
    expect(readingTypeLabel([{ type: 'kunyomi' }])).toBe("kun'yomi")
    expect(readingTypeLabel([{ type: 'nanori' }])).toBe('nanori')
  })

  it('stays quiet when they disagree', () => {
    expect(readingTypeLabel([{ type: 'onyomi' }, { type: 'kunyomi' }])).toBe(null)
  })

  it('stays quiet for readings that carry no type at all', () => {
    expect(readingTypeLabel([{ reading: 'じょうず' }])).toBe(null)
  })

  it('stays quiet when there is nothing to label', () => {
    expect(readingTypeLabel([])).toBe(null)
  })
})

describe('questionLine', () => {
  it('names the subject type and the question', () => {
    expect(questionLine(item('radical', drawnRadical), 'meaning')).toBe('radical · meaning')
  })

  it('adds the reading type when the accepted readings agree on one', () => {
    expect(questionLine(item('kanji', mountain), 'reading')).toBe("kanji · reading · on'yomi")
  })

  // 上 accepts both readings, so naming one would be a lie — but saying
  // nothing leaves you guessing which is wanted when the answer is "either".
  it('says how many will do when the accepted readings disagree', () => {
    expect(questionLine(item('kanji', above), 'reading')).toBe('kanji · reading · any of 2')
  })

  it('leaves it off for vocabulary, whose readings have no type', () => {
    expect(questionLine(item('vocabulary', skill), 'reading')).toBe('vocabulary · reading')
  })

  it('never adds a reading type to a meaning question', () => {
    expect(questionLine(item('kanji', mountain), 'meaning')).toBe('kanji · meaning')
  })
})

describe('acceptedAnswers', () => {
  it('gives the accepted meanings only', () => {
    expect(acceptedAnswers(mountain, 'meaning')).toEqual(['Mountain'])
  })

  // やま is a real reading of 山 and not an answer to the question asked.
  it('gives the accepted readings only', () => {
    expect(acceptedAnswers(mountain, 'reading')).toEqual(['さん'])
  })

  it('gives every accepted reading when there is more than one', () => {
    expect(acceptedAnswers(above, 'reading')).toEqual(['じょう', 'うえ'])
  })

  it('has nothing to show for a subject with no readings', () => {
    expect(acceptedAnswers(drawnRadical, 'reading')).toEqual([])
  })
})

describe('questionParts — which reading, which meaning', () => {
  // Four accepted meanings and no way to know any will do.
  const manyMeanings = {
    characters: '折角',
    meanings: [
      { meaning: 'With Trouble', accepted_answer: true },
      { meaning: 'Valuable', accepted_answer: true },
      { meaning: 'Precious', accepted_answer: true },
      { meaning: 'Rare', accepted_answer: false }
    ],
    readings: [{ reading: 'せっかく', accepted_answer: true }]
  }

  it('names the reading type when every accepted reading agrees', () => {
    expect(questionParts(item('kanji', mountain), 'reading')).toEqual({
      kind: 'kanji',
      asked: 'reading',
      hint: "on'yomi"
    })
  })

  it('says how many will do when they disagree', () => {
    expect(questionParts(item('kanji', above), 'reading').hint).toBe('any of 2')
  })

  it('says how many will do for a word with several accepted meanings', () => {
    expect(questionParts(item('vocabulary', manyMeanings), 'meaning').hint).toBe('any of 3')
  })

  it('counts only the accepted ones', () => {
    // Rare is on the subject but not an accepted answer.
    expect(questionParts(item('vocabulary', manyMeanings), 'meaning').hint).not.toBe('any of 4')
  })

  it('says nothing when there is only one right answer', () => {
    expect(questionParts(item('kanji', mountain), 'meaning').hint).toBe(null)
    expect(questionParts(item('vocabulary', skill), 'reading').hint).toBe(null)
  })

  it('keeps the subject kind separate from what is being asked', () => {
    const { kind, asked } = questionParts(item('radical', drawnRadical), 'meaning')
    expect([kind, asked]).toEqual(['radical', 'meaning'])
  })
})

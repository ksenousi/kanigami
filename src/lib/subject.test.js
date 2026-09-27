import { describe, expect, it } from 'vitest'
import { glyphFor, subjectTypeName } from './subject.js'

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

const drawnRadical = {
  characters: null,
  character_images: [
    { url: 'https://example.invalid/lid.png', content_type: 'image/png' },
    { url: 'https://example.invalid/lid.svg', content_type: 'image/svg+xml' }
  ],
  meanings: [{ meaning: 'Lid', accepted_answer: true }]
}


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

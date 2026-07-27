import { describe, expect, it } from 'vitest'
import { FACES, available, faceFor } from './faces.js'

const named = list => list.map(face => face.key)

describe('FACES', () => {
  it('spans four families rather than four fonts', () => {
    expect(named(FACES)).toEqual(['gothic', 'mincho', 'kyokasho', 'maru'])
  })

  // If the webfont does not arrive, two faces resolving to the same system
  // default would make the shuffle four names for one typeface.
  it('gives every face its own system fallback', () => {
    const first = FACES.map(face => face.stack.split(',')[1].trim())
    expect(new Set(first).size).toBe(FACES.length)
  })

  // macOS names them YuMincho and YuGothic; the spaced spellings are
  // Windows'. Listing only one of the two sent whole stacks to a generic
  // serif on any Mac without Hiragino.
  it('carries both spellings of the Yu faces', () => {
    const all = FACES.map(face => face.stack).join(' ')
    expect(all).toContain('YuGothic')
    expect(all).toContain("'Yu Gothic'")
    expect(all).toContain('YuMincho')
    expect(all).toContain("'Yu Mincho'")
  })
})

describe('faceFor', () => {
  it('rotates so every face comes up the same number of times', () => {
    expect(named([0, 1, 2, 3].map(n => faceFor(n)))).toEqual(named(FACES))
  })

  it('wraps round', () => {
    expect(faceFor(4)).toBe(faceFor(0))
    expect(faceFor(9)).toBe(faceFor(1))
  })

  // The question counter only goes up, but a pure function should not care.
  it('handles a negative index rather than returning nothing', () => {
    expect(faceFor(-1)).toBe(FACES[FACES.length - 1])
  })

  it('rotates over whatever list it is given', () => {
    const two = FACES.slice(0, 2)
    expect(faceFor(2, two)).toBe(two[0])
  })

  it('has nothing to give when there are no faces', () => {
    expect(faceFor(0, [])).toBe(null)
  })
})

describe('available', () => {
  const arrived = names => name => names.includes(name)

  it('keeps the faces whose webfont loaded', () => {
    expect(named(available(arrived(['Noto Sans JP', 'Klee One'])))).toEqual(['gothic', 'kyokasho'])
  })

  it('keeps all four when they all load', () => {
    expect(available(() => true)).toHaveLength(FACES.length)
  })

  // A single face is the app as it was before any of this. Worse, but it
  // still draws a character — an empty list would draw nothing at all.
  it('falls back to one face rather than none when everything is blocked', () => {
    const left = available(() => false)
    expect(named(left)).toEqual(['gothic'])
  })

  it('preserves the declared order', () => {
    expect(named(available(arrived(['Zen Maru Gothic', 'Noto Sans JP'])))).toEqual(['gothic', 'maru'])
  })

  it('never asks about a face that names no webfont', () => {
    const asked = []
    const local = [{ key: 'system', label: 'system', stack: 'serif' }]
    expect(available(name => (asked.push(name), false), local)).toEqual(local)
    expect(asked).toEqual([])
  })
})

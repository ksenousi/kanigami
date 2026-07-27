import { describe, expect, it } from 'vitest'
import { FACES, PROBE, arrivedFaces, available, faceFor } from './faces.js'

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

describe('arrivedFaces', () => {
  // A stand-in for the browser's FontFaceSet. `serialize` is how this engine
  // spells a family name back at you — the whole point of the Safari case
  // below — and it is deliberately never consulted by the code under test.
  function fontSet({ has = () => true, rejects = [], serialize = name => name }) {
    const set = {
      loaded: [],
      load(font, text) {
        const name = font.match(/'(.+)'/)[1]
        set.loaded.push({ name, text })
        if (rejects.includes(name)) return Promise.reject(new Error('blocked'))
        // The real thing resolves with the faces it matched, and with an
        // empty array when it matched none.
        return Promise.resolve(has(name) ? [{ family: serialize(name), status: 'loaded' }] : [])
      },
      // Iterable like the real set, so a rewrite that reaches for `.family`
      // finds something to reach for rather than crashing.
      *[Symbol.iterator]() {
        for (const face of FACES) yield { family: serialize(face.webfont), status: 'loaded' }
      }
    }
    return set
  }

  it('keeps the faces whose webfont resolved', async () => {
    const only = ['Noto Sans JP', 'Klee One']
    const here = await arrivedFaces(fontSet({ has: name => only.includes(name) }))
    expect(named(here)).toEqual(['gothic', 'kyokasho'])
  })

  it('keeps all four when they all resolve', async () => {
    expect(await arrivedFaces(fontSet({}))).toHaveLength(FACES.length)
  })

  // Safari serializes a family name, so `FontFace.family` reads
  // `"Noto Sans JP"` — quote characters and all — where Chrome gives a bare
  // `Noto Sans JP`. The previous fix compared those strings and so found
  // nothing in Safari, collapsing four working fonts to the one-face floor
  // and announcing "1 of 4 typefaces" to somebody whose fonts were fine.
  // Reading what `load` resolves with never asks how the name is spelled.
  it('finds all four even when the engine quotes every family name', async () => {
    const safari = fontSet({ serialize: name => `"${name}"` })
    expect(named(await arrivedFaces(safari))).toEqual(named(FACES))
  })

  // The stylesheet is an external link and may not be parsed yet. `load`
  // matches nothing and resolves *successfully* — which is not proof the
  // fonts are missing, only that it is too early to say. The caller retries.
  it('reports none when the stylesheet has not been parsed yet', async () => {
    const here = await arrivedFaces(fontSet({ has: () => false }))
    expect(named(here)).toEqual(['gothic'])
  })

  // A rejection is this browser saying the bytes are not coming.
  it('treats a rejected load as a font that will not arrive', async () => {
    const here = await arrivedFaces(fontSet({ rejects: ['Noto Serif JP', 'Klee One'] }))
    expect(named(here)).toEqual(['gothic', 'maru'])
  })

  // The Latin subset of a Japanese webfont is a separate file that can land
  // while the kanji does not, so the default Latin probe would say yes too
  // early. Every family is asked about a kanji.
  it('probes with a kanji rather than the default Latin text', async () => {
    const set = fontSet({})
    await arrivedFaces(set)
    expect(set.loaded.map(call => call.name)).toEqual(FACES.map(face => face.webfont))
    expect(new Set(set.loaded.map(call => call.text))).toEqual(new Set([PROBE]))
    expect(PROBE).toMatch(/\p{Script=Han}/u)
  })
})

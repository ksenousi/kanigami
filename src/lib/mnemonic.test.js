import { describe, expect, it } from 'vitest'
import { flatten, parse } from './mnemonic.js'

// Hand-authored in the shape WaniKani's mnemonics come in. Never a real one:
// those are Tofugu's, and this repo is public.
describe('parse', () => {
  it('takes plain prose as one node', () => {
    expect(parse('Nothing marked up at all.')).toEqual([
      { text: 'Nothing marked up at all.', tag: null }
    ])
  })

  it('splits a tagged word out of its sentence', () => {
    expect(parse('Look, a <radical>lid</radical>.')).toEqual([
      { text: 'Look, a ', tag: null },
      { text: 'lid', tag: 'radical' },
      { text: '.', tag: null }
    ])
  })

  it('keeps every tag WaniKani uses', () => {
    const source =
      '<radical>a</radical><kanji>b</kanji><vocabulary>c</vocabulary>' +
      '<reading>d</reading><meaning>e</meaning><ja>f</ja>'
    expect(parse(source).map(node => node.tag)).toEqual([
      'radical',
      'kanji',
      'vocabulary',
      'reading',
      'meaning',
      'ja'
    ])
  })

  it('reads a nested tag as the innermost one', () => {
    expect(parse('<reading>the <ja>やま</ja> part</reading>')).toEqual([
      { text: 'the ', tag: 'reading' },
      { text: 'やま', tag: 'ja' },
      { text: ' part', tag: 'reading' }
    ])
  })

  it('carries an unclosed tag to the end rather than dropping the text', () => {
    expect(parse('and then <kanji>it stops')).toEqual([
      { text: 'and then ', tag: null },
      { text: 'it stops', tag: 'kanji' }
    ])
  })

  it('ignores a close tag that was never opened', () => {
    expect(parse('stray </kanji> tag')).toEqual([{ text: 'stray  tag', tag: null }])
  })

  it('runs adjacent untagged text together', () => {
    expect(parse('one </kanji> two </radical> three')).toEqual([
      { text: 'one  two  three', tag: null }
    ])
  })

  // The security case, and the reason this file exists rather than a call to
  // dangerouslySetInnerHTML. A tag WaniKani does not use is text — and text
  // is all React will ever set it as.
  it('treats markup it does not know as literal text', () => {
    expect(parse('a <script>alert(1)</script> b')).toEqual([
      { text: 'a <script>alert(1)</script> b', tag: null }
    ])
  })

  it('does not let an unknown tag smuggle in an attribute', () => {
    expect(parse('<img src=x onerror=alert(1)>')).toEqual([
      { text: '<img src=x onerror=alert(1)>', tag: null }
    ])
  })

  it('keeps an unknown tag inside a known one, still as text', () => {
    expect(parse('<kanji>up <b>and</b> over</kanji>')).toEqual([
      { text: 'up <b>and</b> over', tag: 'kanji' }
    ])
  })

  it('matches tags whatever case they arrive in', () => {
    expect(parse('<Radical>lid</RADICAL>')).toEqual([{ text: 'lid', tag: 'radical' }])
  })

  it('has nothing to say about nothing', () => {
    expect(parse('')).toEqual([])
    expect(parse(null)).toEqual([])
    expect(parse(undefined)).toEqual([])
  })

  it('drops empty tags rather than emitting empty nodes', () => {
    expect(parse('a<kanji></kanji>b')).toEqual([{ text: 'ab', tag: null }])
  })
})

describe('flatten', () => {
  it('gives the prose without the emphasis', () => {
    expect(flatten('Look, a <radical>lid</radical>.')).toBe('Look, a lid.')
  })

  it('leaves unknown markup where it found it', () => {
    expect(flatten('a <script>x</script> b')).toBe('a <script>x</script> b')
  })
})

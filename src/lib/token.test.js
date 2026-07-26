import { describe, expect, it } from 'vitest'
import { looksLikeToken } from './token.js'

// The grader in Phase 2 is where the real test suite goes. This one exists
// so `npm test` is wired and green from the first phase onward.
describe('looksLikeToken', () => {
  it('accepts a well-formed token', () => {
    expect(looksLikeToken('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
  })

  it('tolerates surrounding whitespace from a paste', () => {
    expect(looksLikeToken('  a1b2c3d4-e5f6-7890-abcd-ef1234567890\n')).toBe(true)
  })

  it('rejects anything that is not a UUID', () => {
    expect(looksLikeToken('not-a-real-token')).toBe(false)
    expect(looksLikeToken('')).toBe(false)
    expect(looksLikeToken('a1b2c3d4e5f67890abcdef1234567890')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { grantedLevels } from './wanikani.js'

// The one pure piece of the client. Everything else in the file is the
// network, and stays out of tests.

describe('grantedLevels', () => {
  it('names every level a capped subscription grants', () => {
    expect(grantedLevels(3)).toBe('&levels=1,2,3')
    expect(grantedLevels(1)).toBe('&levels=1')
  })

  it('filters nothing when everything is granted', () => {
    expect(grantedLevels(60)).toBe('')
  })

  it('filters nothing when the cap is unknown', () => {
    expect(grantedLevels(undefined)).toBe('')
    expect(grantedLevels(null)).toBe('')
  })
})

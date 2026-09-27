import { describe, expect, it } from 'vitest'
import { stageName } from './srs.js'

describe('stageName', () => {
  it('names the stages WaniKani numbers', () => {
    expect(stageName(0)).toBe('initiate')
    expect(stageName(1)).toBe('apprentice I')
    expect(stageName(4)).toBe('apprentice IV')
    expect(stageName(5)).toBe('guru I')
    expect(stageName(7)).toBe('master')
    expect(stageName(8)).toBe('enlightened')
    expect(stageName(9)).toBe('burned')
  })

  // If WaniKani ever adds a stage, showing the number beats showing nothing
  // and beats guessing what it is called.
  it('shows an unknown stage as itself', () => {
    expect(stageName(12)).toBe('stage 12')
  })
})

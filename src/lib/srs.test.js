import { describe, expect, it } from 'vitest'
import { movement, stageName } from './srs.js'

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

describe('movement', () => {
  it('reads the two stages out of the response', () => {
    expect(movement({ starting_srs_stage: 4, ending_srs_stage: 5 })).toBe('apprentice IV → guru I')
  })

  it('reports a fall as readily as a rise', () => {
    expect(movement({ starting_srs_stage: 5, ending_srs_stage: 3 })).toBe('guru I → apprentice III')
  })

  // A started lesson answers with an assignment, which has one stage and no
  // movement — there was nowhere for it to move from.
  it('names the single stage a started lesson comes back at', () => {
    expect(movement({ srs_stage: 1 })).toBe('apprentice I')
  })

  it('prefers a real movement over a single stage when it has both', () => {
    expect(movement({ starting_srs_stage: 4, ending_srs_stage: 5, srs_stage: 5 })).toBe(
      'apprentice IV → guru I'
    )
  })

  it('says nothing rather than guessing when the response is short of stages', () => {
    expect(movement({ starting_srs_stage: 4 })).toBe(null)
    expect(movement({})).toBe(null)
    expect(movement(null)).toBe(null)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createSubmitter, dryRunLine, reviewFor } from './submit.js'

// A completed item as the session engine hands it over. Fake ids throughout.
const completed = (over = {}) => ({
  subjectId: 440,
  assignmentId: 8001,
  incorrectMeaning: 0,
  incorrectReading: 1,
  ...over
})

// What POST /reviews answers with. Only the fields the app actually reads.
const receipt = (over = {}) => ({
  id: 90001,
  starting_srs_stage: 4,
  ending_srs_stage: 5,
  ...over
})

class Refusal extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// Never a real sleep: the backoff schedule is asserted on, not waited out.
function submitter(over = {}) {
  const slept = []
  const logged = []
  const it = createSubmitter({
    sleep: ms => {
      slept.push(ms)
      return Promise.resolve()
    },
    log: line => logged.push(line),
    ...over
  })
  return { it, slept, logged }
}

describe('reviewFor', () => {
  it('sends the counts and nothing WaniKani decides for itself', () => {
    expect(reviewFor(completed())).toEqual({
      assignmentId: 8001,
      incorrectMeaning: 0,
      incorrectReading: 1
    })
  })
})

describe('dryRunLine', () => {
  it('reads as the request it stands in for', () => {
    expect(dryRunLine(reviewFor(completed()))).toBe(
      'dry run: POST /reviews {assignment_id: 8001, meaning: 0, reading: 1}'
    )
  })
})

describe('dry run', () => {
  // The one that matters most: a submitter nobody configured must not write.
  it('is what you get when nobody says otherwise', () => {
    const send = vi.fn()
    const { it: sub, logged } = submitter({ send })
    sub.push(completed())
    expect(send).not.toHaveBeenCalled()
    expect(logged).toEqual(['dry run: POST /reviews {assignment_id: 8001, meaning: 0, reading: 1}'])
  })

  it('reports the item as handled without inventing a stage', async () => {
    const { it: sub } = submitter({ send: vi.fn() })
    sub.push(completed())
    await sub.idle()
    expect(sub.state().results[440]).toEqual({ status: 'dry-run', review: null, message: null })
  })

  it('says so in the state it hands to the screen', () => {
    expect(submitter().it.state().dryRun).toBe(true)
    expect(submitter({ dryRun: false }).it.state().dryRun).toBe(false)
  })
})

describe('submitting', () => {
  it('sends the accumulated counts once', async () => {
    const send = vi.fn().mockResolvedValue(receipt())
    const { it: sub } = submitter({ send, dryRun: false })
    sub.push(completed())
    await sub.idle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      assignmentId: 8001,
      incorrectMeaning: 0,
      incorrectReading: 1
    })
  })

  it('keeps the response so the screen can report the movement', async () => {
    const { it: sub } = submitter({ send: () => Promise.resolve(receipt()), dryRun: false })
    sub.push(completed())
    await sub.idle()
    expect(sub.state().results[440]).toEqual({
      status: 'sent',
      review: receipt(),
      message: null
    })
  })

  it('submits as items complete rather than batching them', async () => {
    const seen = []
    const send = review => {
      seen.push(review.assignmentId)
      return Promise.resolve(receipt())
    }
    const { it: sub } = submitter({ send, dryRun: false })

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    await sub.idle()
    expect(seen).toEqual([8001])

    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    await sub.idle()
    expect(seen).toEqual([8001, 8002])
  })

  it('sends one at a time, in the order the items finished', async () => {
    const order = []
    let release
    const first = new Promise(resolve => {
      release = resolve
    })
    const send = review => {
      order.push(review.assignmentId)
      return review.assignmentId === 8001 ? first.then(() => receipt()) : Promise.resolve(receipt())
    }
    const { it: sub } = submitter({ send, dryRun: false })

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    expect(order).toEqual([8001])

    release()
    await sub.idle()
    expect(order).toEqual([8001, 8002])
  })

  it('has nothing to submit for an item with no assignment', async () => {
    const send = vi.fn()
    const { it: sub } = submitter({ send, dryRun: false })
    sub.push(completed({ assignmentId: null }))
    await sub.idle()
    expect(send).not.toHaveBeenCalled()
    expect(sub.state().results[440].status).toBe('skipped')
  })
})

describe('when WaniKani refuses', () => {
  it('retries a server error on the backoff schedule and keeps the answer', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Refusal('WaniKani returned 500.', 500))
      .mockRejectedValueOnce(new Refusal('WaniKani returned 500.', 500))
      .mockResolvedValue(receipt())
    const { it: sub, slept } = submitter({ send, dryRun: false })

    sub.push(completed())
    await sub.idle()

    expect(send).toHaveBeenCalledTimes(3)
    expect(slept).toEqual([1000, 4000])
    expect(sub.state().results[440].status).toBe('sent')
    expect(sub.state().failed).toEqual([])
  })

  // A rejected token will still be rejected in a minute. Waiting is a way of
  // not saying so.
  it('gives up at once on a refusal that retrying cannot fix', async () => {
    const send = vi.fn().mockRejectedValue(new Refusal('That token was rejected.', 401))
    const { it: sub, slept } = submitter({ send, dryRun: false })

    sub.push(completed())
    await sub.idle()

    expect(send).toHaveBeenCalledTimes(1)
    expect(slept).toEqual([])
    expect(sub.state().failed).toEqual([{ subjectId: 440, message: 'That token was rejected.' }])
  })

  it('gives up after the last delay rather than retrying forever', async () => {
    const send = vi.fn().mockRejectedValue(new Refusal('WaniKani returned 503.', 503))
    const { it: sub, slept } = submitter({ send, dryRun: false })

    sub.push(completed())
    await sub.idle()

    expect(send).toHaveBeenCalledTimes(5)
    expect(slept).toEqual([1000, 4000, 15_000, 60_000])
    expect(sub.state().results[440]).toEqual({
      status: 'failed',
      review: null,
      message: 'WaniKani returned 503.'
    })
  })

  it('surfaces a stuck answer rather than dropping it', async () => {
    const send = vi.fn().mockRejectedValue(new Refusal('WaniKani returned 422.', 422))
    const { it: sub } = submitter({ send, dryRun: false })

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    await sub.idle()

    expect(sub.state().failed).toHaveLength(2)
  })

  it('carries on with the next item after one fails', async () => {
    const send = vi.fn(review =>
      review.assignmentId === 8001
        ? Promise.reject(new Refusal('WaniKani returned 422.', 422))
        : Promise.resolve(receipt())
    )
    const { it: sub } = submitter({ send, dryRun: false })

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    await sub.idle()

    expect(sub.state().results[1].status).toBe('failed')
    expect(sub.state().results[2].status).toBe('sent')
  })
})

describe('what the screen is told', () => {
  it('counts what is still in flight', async () => {
    let release
    const held = new Promise(resolve => {
      release = resolve
    })
    const { it: sub } = submitter({ send: () => held.then(() => receipt()), dryRun: false })

    const seen = []
    sub.watch(next => seen.push(next.syncing))

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    expect(sub.state().syncing).toBe(2)

    release()
    await sub.idle()

    expect(sub.state().syncing).toBe(0)
    expect(seen).toEqual([1, 2, 1, 0])
  })

  it('stops telling a listener that has unsubscribed', async () => {
    const seen = []
    const { it: sub } = submitter({ send: () => Promise.resolve(receipt()), dryRun: false })
    const stop = sub.watch(next => seen.push(next.syncing))

    sub.push(completed({ subjectId: 1, assignmentId: 8001 }))
    stop()
    sub.push(completed({ subjectId: 2, assignmentId: 8002 }))
    await sub.idle()

    expect(seen).toEqual([1])
  })

  it('hands out a snapshot, not the live queue', async () => {
    const { it: sub } = submitter({ send: () => Promise.resolve(receipt()), dryRun: false })
    const before = sub.state()

    sub.push(completed())
    await sub.idle()

    expect(before.results).toEqual({})
    expect(Object.keys(sub.state().results)).toEqual(['440'])
  })
})

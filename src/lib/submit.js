// Submitting completed items.
//
// This is the only code in the app that changes somebody's real SRS
// progress, and there is no undo for anything it sends. It is built so that
// the dangerous part is one line — `send` — and everything around it can be
// tested without going near the network.
//
// Two rules from the plan are structural here rather than advisory:
//
//   * **Dry run is the default.** Constructing a submitter without saying
//     `dryRun: false` gives you one that logs the request it would have made
//     and sends nothing.
//   * **Items are submitted as they complete, not batched at the end.** A
//     closed tab loses the questions still in the queue and nothing else.
//
// No React in here. A component subscribes with `watch` and re-renders on
// whatever it is handed.

// Retry delays for failures worth retrying. Four attempts after the first,
// then the answer stays in `failed` where the screen can say so — surfacing a
// stuck answer beats a spinner that never resolves.
const BACKOFF = [1000, 4000, 15_000, 60_000]

// Statuses where trying again cannot help: the token is wrong, or WaniKani
// has decided this assignment is not up for review. Retrying a 422 sixty
// seconds later just delays telling the truth.
const FINAL = [400, 401, 403, 404, 422]

// What POST /reviews is told. WaniKani takes the wrong-answer counts and
// decides the rest; we never send a stage.
export function reviewFor(item) {
  return {
    assignmentId: item.assignmentId,
    incorrectMeaning: item.incorrectMeaning,
    incorrectReading: item.incorrectReading
  }
}

export function dryRunLine(review) {
  return (
    'dry run: POST /reviews ' +
    `{assignment_id: ${review.assignmentId}, ` +
    `meaning: ${review.incorrectMeaning}, reading: ${review.incorrectReading}}`
  )
}

// Lessons write to a different endpoint with a different body, so they say a
// different thing. The dry-run log is only worth reading if it names the
// request that was not made.
export function startLine(review) {
  return `dry run: PUT /assignments/${review.assignmentId}/start`
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function createSubmitter({
  send,
  dryRun = true,
  describe = dryRunLine,
  sleep = defaultSleep,
  log = line => console.info(line)
} = {}) {
  const queue = []
  const failed = []
  const results = {}
  const listeners = new Set()
  let running = false
  let draining = Promise.resolve()

  function state() {
    return { syncing: queue.length, failed: [...failed], results: { ...results }, dryRun }
  }

  function announce() {
    const snapshot = state()
    for (const listener of listeners) listener(snapshot)
  }

  function settle(subjectId, result) {
    results[subjectId] = result
    if (result.status === 'failed') failed.push({ subjectId, message: result.message })
  }

  async function attempt(job) {
    if (dryRun) {
      log(describe(job.review))
      return { status: 'dry-run', review: null, message: null }
    }

    for (let attempts = 0; ; attempts++) {
      try {
        return { status: 'sent', review: await send(job.review), message: null }
      } catch (problem) {
        const hopeless = FINAL.includes(problem.status) || attempts >= BACKOFF.length
        if (hopeless) return { status: 'failed', review: null, message: problem.message }
        await sleep(BACKOFF[attempts])
      }
    }
  }

  // One at a time and in the order they were finished: it keeps well clear of
  // the rate limit, and a queue that fans out has no order to report.
  async function drain() {
    running = true
    while (queue.length > 0) {
      const job = queue[0]
      const result = await attempt(job)
      queue.shift()
      settle(job.subjectId, result)
      announce()
    }
    running = false
  }

  return {
    // `item` is a completed item from the session engine.
    push(item) {
      if (!item.assignmentId) {
        // Reviewable, but with nothing to submit against — an item fetched
        // without its assignment. Say so rather than spinning forever.
        settle(item.subjectId, {
          status: 'skipped',
          review: null,
          message: 'no assignment to submit against'
        })
        announce()
        return
      }

      queue.push({ subjectId: item.subjectId, review: reviewFor(item) })
      announce()
      // A run already in flight will pick this up on its next turn; its
      // promise does not resolve until the queue is empty.
      if (!running) draining = drain()
    },

    watch(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Resolves when nothing is left in flight. Ending a session early waits
    // on this before walking away from what is still unsent.
    idle: () => draining,

    state
  }
}

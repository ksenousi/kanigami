// The session engine — a pure state machine over the review queue.
//
// No React, no fetching, no clock. `createSession` takes the API resources
// the caller has already fetched; every other function here is a plain
// transform over the value it returned. Nothing mutates, so a test can hold
// two generations of a session side by side and compare them.
//
// The engine knows nothing about grading. It takes a verdict — the same
// three-way verdict `grade()` produces — and moves the queue accordingly.

// A subject's reading question is queued this many items after its meaning,
// so the two are never asked back to back.
const READING_LAG = 3

// A missed question goes back this far down the queue. Far enough that the
// answer is recalled rather than echoed, near enough to still be the same
// session.
const REQUEUE_GAP = 3

// Radicals have no readings, and neither do kana-only vocabulary. Rather
// than special-casing the subject type, ask what the subject actually has.
function questionTypesFor(subject) {
  return subject.readings?.length ? ['meaning', 'reading'] : ['meaning']
}

// Lay the questions out so that consecutive entries are different subjects
// and, wherever there is enough material, alternate between meaning and
// reading. Walking one lag past the end flushes the trailing readings.
function buildQueue(items) {
  const queue = []
  for (let i = 0; i < items.length + READING_LAG; i++) {
    const asking = items[i]
    if (asking) queue.push({ subjectId: asking.subjectId, questionType: 'meaning' })

    const trailing = items[i - READING_LAG]
    if (trailing?.questionTypes.includes('reading')) {
      queue.push({ subjectId: trailing.subjectId, questionType: 'reading' })
    }
  }
  return queue
}

// The queue head, unless it repeats the subject we just asked about and
// something else is available. Returns -1 on an empty queue.
function selectIndex(session) {
  if (session.queue.length === 0) return -1
  const fresh = session.queue.findIndex(entry => entry.subjectId !== session.lastSubjectId)
  return fresh === -1 ? 0 : fresh
}

function itemFor(session, subjectId) {
  return session.items.find(item => item.subjectId === subjectId)
}

// Both questions right. Only complete items are eligible for submission —
// the counts on an incomplete item are still accumulating.
export function isComplete(item) {
  return item.questionTypes.every(type =>
    type === 'meaning' ? item.meaningDone : item.readingDone
  )
}

// `subjects` are subject resources from `getSubjects`, `assignments` are
// assignment resources from `getAvailableReviews`. The subject order sets the
// queue order; an item with no matching assignment is still reviewable, it
// just has nothing to submit against.
export function createSession(subjects, assignments = []) {
  const bySubjectId = new Map(assignments.map(a => [a.data.subject_id, a]))

  const items = subjects.map(resource => ({
    subjectId: resource.id,
    assignmentId: bySubjectId.get(resource.id)?.id ?? null,
    type: resource.object,
    subject: resource.data,
    questionTypes: questionTypesFor(resource.data),
    meaningDone: false,
    readingDone: false,
    incorrectMeaning: 0,
    incorrectReading: 0
  }))

  return {
    items,
    queue: buildQueue(items),
    lastSubjectId: null,
    justCompleted: null
  }
}

// The question to ask now, or null when the session is finished.
export function nextQuestion(session) {
  const index = selectIndex(session)
  if (index === -1) return null

  const entry = session.queue[index]
  const item = itemFor(session, entry.subjectId)
  return { item, subject: item.subject, questionType: entry.questionType }
}

function record(item, questionType, verdict) {
  if (questionType === 'meaning') {
    return verdict === 'correct'
      ? { ...item, meaningDone: true }
      : { ...item, incorrectMeaning: item.incorrectMeaning + 1 }
  }
  return verdict === 'correct'
    ? { ...item, readingDone: true }
    : { ...item, incorrectReading: item.incorrectReading + 1 }
}

// Answer the question `nextQuestion` handed out. 'correct' retires the
// question, 'incorrect' counts the miss and sends it back down the queue, and
// 'retry' — the grader's nudge for a right answer to the wrong question —
// leaves the session untouched, which is the whole point of it.
//
// The question has to be passed back in, and has to be the one the session is
// actually asking. A component holding a stale question across a re-render
// would otherwise grade the wrong item in silence; here it throws, because
// that is a wiring mistake and not something a user can cause.
export function answer(session, question, verdict) {
  const index = selectIndex(session)
  if (index === -1) {
    throw new Error('answer: the session is finished — nothing is being asked')
  }

  const entry = session.queue[index]
  if (question?.item?.subjectId !== entry.subjectId || question?.questionType !== entry.questionType) {
    throw new Error(
      `answer: the session is asking ${entry.subjectId}/${entry.questionType}, ` +
      `but was handed ${question?.item?.subjectId ?? '?'}/${question?.questionType ?? '?'}`
    )
  }

  if (verdict !== 'correct' && verdict !== 'incorrect') return session

  const items = session.items.map(item =>
    item.subjectId === entry.subjectId ? record(item, entry.questionType, verdict) : item
  )

  const queue = session.queue.filter((_, i) => i !== index)
  if (verdict === 'incorrect') {
    queue.splice(Math.min(REQUEUE_GAP, queue.length), 0, entry)
  }

  // A miss never completes an item, so only a correct answer can be the one
  // that finishes it — no need to compare against the previous generation.
  const answered = items.find(item => item.subjectId === entry.subjectId)
  const completed = verdict === 'correct' && isComplete(answered)

  return {
    ...session,
    items,
    queue,
    lastSubjectId: entry.subjectId,
    justCompleted: completed ? answered : null
  }
}

// Items, not questions: `remaining` is what the footer counts down.
export function sessionProgress(session) {
  const completed = session.items.filter(isComplete).length
  return { remaining: session.items.length - completed, completed, total: session.items.length }
}

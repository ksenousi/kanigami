import { describe, expect, it } from 'vitest'
import {
  answer,
  createSession,
  isComplete,
  nextQuestion,
  sessionProgress
} from './session.js'

// Trimmed-down API resources. The engine only reads `id`, `object` and
// whether the subject has readings, so the fixtures carry just that plus
// enough characters to make a failure legible.
function kanji(id, characters) {
  return {
    id,
    object: 'kanji',
    data: {
      characters,
      meanings: [{ meaning: 'placeholder', accepted_answer: true }],
      readings: [{ reading: 'か', accepted_answer: true }]
    }
  }
}

function radical(id, characters) {
  return {
    id,
    object: 'radical',
    data: { characters, meanings: [{ meaning: 'placeholder', accepted_answer: true }] }
  }
}

function assignment(id, subjectId) {
  return { id, object: 'assignment', data: { subject_id: subjectId } }
}

const TEN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const tenKanji = () => TEN.map((characters, i) => kanji(100 + i, characters))

// Walk a session to the end, answering every question with `verdict(question)`.
// Returns the finished session and the questions in the order they were asked.
function play(session, verdict = () => 'correct') {
  const asked = []
  let guard = 500
  let current = nextQuestion(session)
  while (current && guard-- > 0) {
    asked.push(current)
    session = answer(session, current, verdict(current, asked.length))
    current = nextQuestion(session)
  }
  return { session, asked }
}

const label = question => `${question.item.subjectId}:${question.questionType}`

// Most tests care about the verdict, not about which question carries it.
const ask = (session, verdict) => answer(session, nextQuestion(session), verdict)

describe('createSession', () => {
  it('pairs subjects with their assignments', () => {
    const session = createSession(
      [kanji(1, '山'), radical(2, '亠')],
      [assignment(90, 2), assignment(91, 1)]
    )

    expect(session.items.map(i => [i.subjectId, i.assignmentId])).toEqual([[1, 91], [2, 90]])
  })

  it('leaves assignmentId null when a subject has no assignment', () => {
    const session = createSession([kanji(1, '山')])
    expect(session.items[0].assignmentId).toBe(null)
  })

  it('asks radicals for meaning only, kanji for both', () => {
    const session = createSession([kanji(1, '山'), radical(2, '亠')])
    expect(session.items[0].questionTypes).toEqual(['meaning', 'reading'])
    expect(session.items[1].questionTypes).toEqual(['meaning'])
  })

  it('starts every item at zero', () => {
    const [item] = createSession([kanji(1, '山')]).items
    expect(item.meaningDone).toBe(false)
    expect(item.readingDone).toBe(false)
    expect(item.incorrectMeaning).toBe(0)
    expect(item.incorrectReading).toBe(0)
  })
})

describe('interleaving', () => {
  it('never asks the same subject twice in a row', () => {
    const { asked } = play(createSession(tenKanji()))
    const repeats = asked.filter(
      (question, i) => i > 0 && asked[i - 1].item.subjectId === question.item.subjectId
    )
    expect(repeats).toEqual([])
  })

  it('puts other subjects between a subject\'s meaning and its reading', () => {
    const { asked } = play(createSession(tenKanji()))
    const labels = asked.map(label)

    for (const subject of tenKanji()) {
      const meaning = labels.indexOf(`${subject.id}:meaning`)
      const reading = labels.indexOf(`${subject.id}:reading`)
      expect(reading - meaning).toBeGreaterThan(1)
    }
  })

  it('alternates question types once readings enter the queue', () => {
    const { asked } = play(createSession(tenKanji()))
    const types = asked.map(q => q.questionType)

    // The first few are meanings while the reading lag fills; after that the
    // queue trades off between the two.
    expect(types.slice(0, 3)).toEqual(['meaning', 'meaning', 'meaning'])
    expect(types.slice(3, 9)).toEqual([
      'meaning', 'reading', 'meaning', 'reading', 'meaning', 'reading'
    ])
  })

  it('asks a lone subject both questions back to back rather than stalling', () => {
    const { asked } = play(createSession([kanji(1, '山')]))
    expect(asked.map(label)).toEqual(['1:meaning', '1:reading'])
  })

  it('asks every question exactly once when nothing is missed', () => {
    const { asked } = play(createSession(tenKanji()))
    expect(asked).toHaveLength(20)
    expect(new Set(asked.map(label)).size).toBe(20)
  })
})

describe('requeueing a miss', () => {
  it('puts the missed question back with other items in between', () => {
    const session = createSession(tenKanji())
    const missed = label(nextQuestion(session))

    const after = ask(session, 'incorrect')
    const upcoming = []
    let walk = after
    for (let i = 0; i < 5; i++) {
      upcoming.push(label(nextQuestion(walk)))
      walk = ask(walk, 'correct')
    }

    expect(upcoming.slice(0, 3)).not.toContain(missed)
    expect(upcoming[3]).toBe(missed)
  })

  it('keeps the missed question in the session until it is answered right', () => {
    let missesLeft = 1
    const { asked } = play(createSession(tenKanji()), question => {
      if (label(question) === '100:meaning' && missesLeft > 0) {
        missesLeft -= 1
        return 'incorrect'
      }
      return 'correct'
    })

    expect(asked.filter(q => label(q) === '100:meaning')).toHaveLength(2)
    expect(asked).toHaveLength(21)
  })

  it('requeues at the end when the queue is nearly empty', () => {
    const session = createSession([kanji(1, '山')])
    const after = ask(session, 'incorrect')

    expect(after.queue).toHaveLength(2)
    expect(nextQuestion(after).questionType).toBe('reading')
  })
})

describe('wrong-answer counts', () => {
  it('accumulates across retries within the session', () => {
    // Miss the meaning of 一 twice and its reading once, then get everything
    // right. The counts are what Phase 4 will hand to POST /reviews.
    const misses = { '100:meaning': 2, '100:reading': 1 }
    const { session } = play(createSession(tenKanji()), question => {
      const key = label(question)
      if (misses[key] > 0) {
        misses[key] -= 1
        return 'incorrect'
      }
      return 'correct'
    })

    const item = session.items.find(i => i.subjectId === 100)
    expect(item.incorrectMeaning).toBe(2)
    expect(item.incorrectReading).toBe(1)
    expect(isComplete(item)).toBe(true)
  })

  it('counts a miss against the question that was asked, not the item', () => {
    const session = createSession([kanji(1, '山')])
    const after = ask(session, 'incorrect')
    const item = after.items[0]

    expect(item.incorrectMeaning).toBe(1)
    expect(item.incorrectReading).toBe(0)
    expect(item.meaningDone).toBe(false)
  })

  it('leaves the session untouched on a retry verdict', () => {
    const session = createSession(tenKanji())
    expect(ask(session, 'retry')).toBe(session)
  })

  it('refuses an answer when the queue is empty', () => {
    const { session } = play(createSession([radical(1, '亠')]))
    expect(nextQuestion(session)).toBe(null)
    expect(() => answer(session, null, 'correct')).toThrow(/finished/)
  })

  it('refuses a question the session has moved past', () => {
    const session = createSession(tenKanji())
    const stale = nextQuestion(session)
    const moved = answer(session, stale, 'correct')

    // The component still holds `stale`; the session is asking something else.
    expect(() => answer(moved, stale, 'correct')).toThrow(/is asking/)
    expect(() => answer(moved, stale, 'retry')).toThrow(/is asking/)
  })

  it('refuses the right subject asked for the wrong thing', () => {
    const session = createSession([kanji(1, '山')])
    const meaning = nextQuestion(session)
    const reading = { ...meaning, questionType: 'reading' }

    expect(() => answer(session, reading, 'correct')).toThrow(/1\/meaning/)
  })
})

describe('completion', () => {
  it('completes a radical after one correct meaning', () => {
    const session = createSession([radical(1, '亠')])
    expect(nextQuestion(session).questionType).toBe('meaning')

    const after = ask(session, 'correct')
    expect(isComplete(after.items[0])).toBe(true)
    expect(after.justCompleted?.subjectId).toBe(1)
    expect(nextQuestion(after)).toBe(null)
    expect(sessionProgress(after)).toEqual({ remaining: 0, completed: 1, total: 1 })
  })

  it('holds a kanji incomplete until both questions are right', () => {
    const session = createSession([kanji(1, '山'), kanji(2, '川')])

    const afterMeaning = ask(session, 'correct')
    expect(isComplete(afterMeaning.items[0])).toBe(false)
    expect(afterMeaning.justCompleted).toBe(null)

    const { session: done } = play(afterMeaning)
    expect(isComplete(done.items[0])).toBe(true)
  })

  it('reports the item that a correct answer just finished', () => {
    const { asked, session } = play(createSession([kanji(1, '山')]))
    expect(asked).toHaveLength(2)
    expect(session.justCompleted?.subjectId).toBe(1)
  })

  it('does not complete an item on a miss', () => {
    const session = createSession([radical(1, '亠')])
    expect(ask(session, 'incorrect').justCompleted).toBe(null)
  })
})

describe('sessionProgress', () => {
  it('counts items, not questions', () => {
    const session = createSession(tenKanji())
    expect(sessionProgress(session)).toEqual({ remaining: 10, completed: 0, total: 10 })

    const { session: done } = play(session)
    expect(sessionProgress(done)).toEqual({ remaining: 0, completed: 10, total: 10 })
  })

  it('holds an item in remaining while it is half answered', () => {
    const session = ask(createSession([kanji(1, '山'), kanji(2, '川')]), 'correct')
    expect(sessionProgress(session)).toEqual({ remaining: 2, completed: 0, total: 2 })
  })

  it('handles an empty queue', () => {
    const session = createSession([])
    expect(nextQuestion(session)).toBe(null)
    expect(sessionProgress(session)).toEqual({ remaining: 0, completed: 0, total: 0 })
  })
})

describe('immutability', () => {
  it('leaves the previous session untouched', () => {
    const session = createSession(tenKanji())
    const queueLength = session.queue.length

    ask(session, 'incorrect')

    expect(session.queue).toHaveLength(queueLength)
    expect(session.items[0].incorrectMeaning).toBe(0)
    expect(session.lastSubjectId).toBe(null)
  })
})

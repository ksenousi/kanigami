// Assembling a session out of the API.
//
// The only impure part of either path: three reads — four when the session
// holds single-character vocabulary — then Phase 1's `createSession` over
// what came back. It fetches subjects for the assignments in hand and
// nothing else — the whole-database sync is the offline feature this app
// deliberately does not have.
//
// Reviews and lessons load identically. A lesson batch is the same shape,
// capped at five, and the session it carries is the quiz that follows the
// reading.

import {
  getAvailableLessons,
  getAvailableReviews,
  getStudyMaterials,
  getSubjects
} from './wanikani.js'
import { createSession } from './session.js'

// WaniKani teaches in batches, and so does this. Five is theirs.
export const LESSON_BATCH = 5

export function loadReviewSession(token) {
  return load(token, getAvailableReviews)
}

// The same reads, over the assignments waiting to be taught rather than
// the ones due for review, and only one batch of them. `items` comes back
// alongside because the lesson surface has to typeset them before the quiz
// the session is for.
export async function loadLessonBatch(token, size = LESSON_BATCH) {
  const loaded = await load(token, getAvailableLessons, size)
  return { ...loaded, items: loaded.session.items }
}

async function load(token, fetchAssignments, limit) {
  const waiting = await fetchAssignments(token)
  const assignments = typeof limit === 'number' ? waiting.slice(0, limit) : waiting
  if (assignments.length === 0) {
    return { session: createSession([]), synonyms: {}, kanjiReadings: {} }
  }

  const ids = assignments.map(a => a.data.subject_id)
  // Synonyms have to be in hand before the first question is graded, not
  // fetched when one turns up — hence alongside the subjects, not after.
  const [subjects, materials] = await Promise.all([
    getSubjects(token, ids),
    getStudyMaterials(token, ids)
  ])

  // Same reasoning, one read later: the grader shakes off a kanji's reading
  // typed at a single-character word, and the word's subject does not carry
  // its kanji's readings — only a pointer to them.
  const kanjiReadings = await componentReadings(token, subjects)

  // getSubjects chunks its requests and resolves them in parallel, so the
  // order it hands back is not guaranteed. The queue order is the assignment
  // order.
  const position = new Map(ids.map((id, index) => [id, index]))
  const ordered = [...subjects].sort((a, b) => position.get(a.id) - position.get(b.id))

  const synonyms = {}
  for (const material of materials) {
    const list = material.data.meaning_synonyms ?? []
    if (list.length > 0) synonyms[material.data.subject_id] = list
  }

  return { session: createSession(ordered, assignments), synonyms, kanjiReadings }
}

// 人 the word and 人 the kanji are one glyph and two subjects, so the kanji's
// reading typed at the word is a mix-up for the grader to shake off, not a
// miss — and it can only tell if it has the kanji's readings. Collected for
// each single-character vocabulary in the session from its component kanji,
// which are fetched only when the session's own subjects do not already
// include them. Keyed by the vocabulary's subject id, values are bare reading
// strings.
async function componentReadings(token, subjects) {
  const single = subjects.filter(
    s => s.object === 'vocabulary' && [...(s.data.characters ?? '')].length === 1
  )
  if (single.length === 0) return {}

  const held = new Map(subjects.map(s => [s.id, s]))
  const wanted = [...new Set(single.flatMap(s => s.data.component_subject_ids ?? []))]
  const missing = wanted.filter(id => !held.has(id))
  const fetched = missing.length > 0 ? await getSubjects(token, missing) : []
  for (const s of fetched) held.set(s.id, s)

  const readings = {}
  for (const s of single) {
    const list = (s.data.component_subject_ids ?? [])
      .flatMap(id => held.get(id)?.data.readings ?? [])
      .map(r => r.reading)
    if (list.length > 0) readings[s.id] = list
  }
  return readings
}

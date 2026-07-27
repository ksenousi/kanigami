// Assembling a session out of the API.
//
// The only impure part of either path: three reads, then Phase 1's
// `createSession` over what came back. It fetches subjects for the
// assignments in hand and nothing else — the whole-database sync is the
// offline feature this app deliberately does not have.
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

// The same three reads, over the assignments waiting to be taught rather than
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
  if (assignments.length === 0) return { session: createSession([]), synonyms: {} }

  const ids = assignments.map(a => a.data.subject_id)
  // Synonyms have to be in hand before the first question is graded, not
  // fetched when one turns up — hence alongside the subjects, not after.
  const [subjects, materials] = await Promise.all([
    getSubjects(token, ids),
    getStudyMaterials(token, ids)
  ])

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

  return { session: createSession(ordered, assignments), synonyms }
}

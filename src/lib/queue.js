// Assembling a review session out of the API.
//
// The only impure part of the review path: three reads, then Phase 1's
// `createSession` over what came back. It fetches subjects for the
// assignments that are due and nothing else — the whole-database sync is the
// offline feature this app deliberately does not have.

import { getAvailableReviews, getStudyMaterials, getSubjects } from './wanikani.js'
import { createSession } from './session.js'

export async function loadReviewSession(token) {
  const assignments = await getAvailableReviews(token)
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

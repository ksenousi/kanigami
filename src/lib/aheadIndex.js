// Every radical and word WaniKani teaches, as id, level and type — what lets
// taught's slider count the radicals and vocabulary a later level brings,
// as kanjiIndex does the kanji.
//
// Kept a week in localStorage, like the kanji index: the read behind it is
// the largest the app makes (see getAllRadicalAndVocabularySubjects). A
// refresh that fails keeps the old copy, however old. Two numbers and a
// letter per subject — the subjects themselves are never kept.

import { getAllRadicalAndVocabularySubjects } from './wanikani.js'
import { subjectTypeName } from './subject.js'

const KEY = 'kanigami-ahead'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// [id, level, 'r' or 'v'], for every radical and word.
export function compact(subjects = []) {
  return subjects
    .filter(s => typeof s?.id === 'number' && typeof s?.data?.level === 'number')
    .map(s => [s.id, s.data.level, subjectTypeName(s.object) === 'radical' ? 'r' : 'v'])
}

export function isComplete(record) {
  return Boolean(record && typeof record.at === 'number' && Array.isArray(record.subjects) && record.subjects.length > 0)
}

export function isFresh(record, now) {
  return isComplete(record) && now - record.at < WEEK_MS
}

// For each level from 0 to 60, how many radicals and words at or below it
// you have not started — what WaniKani would add to taught once it has
// taught you everything through that level. A projection: it assumes every
// lesson up to there is done.
export function aheadByLevel(index = [], assignments = [], top = 60) {
  const started = new Set(assignments.filter(a => a?.data?.started_at).map(a => a.data.subject_id))
  const radical = Array.from({ length: top + 1 }, () => 0)
  const vocabulary = Array.from({ length: top + 1 }, () => 0)
  for (const [id, level, kind] of index) {
    if (started.has(id) || level > top) continue
    ;(kind === 'r' ? radical : vocabulary)[level] += 1
  }
  for (let l = 1; l <= top; l++) {
    radical[l] += radical[l - 1]
    vocabulary[l] += vocabulary[l - 1]
  }
  return { radical, vocabulary }
}

export async function aheadIndex(token, now = Date.now()) {
  let held = null
  try {
    held = JSON.parse(localStorage.getItem(KEY))
  } catch {
    // Unreadable is the same as absent.
  }
  if (isFresh(held, now)) return held.subjects

  let record
  try {
    record = { at: now, subjects: compact(await getAllRadicalAndVocabularySubjects(token)) }
  } catch (problem) {
    if (isComplete(held)) return held.subjects
    throw problem
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // No storage: this visit still has the index.
  }
  return record.subjects
}

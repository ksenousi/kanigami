// Every kanji WaniKani teaches, as id, level and character — what coverage
// counts against the JLPT and Jōyō lists, and what lets its slider say how
// much you will know through a later level.
//
// Kept a week in localStorage, like the totals: the read behind it is the
// largest the app makes (see getAllKanjiSubjects), and what WaniKani teaches
// changes a few times a year. A refresh that fails keeps the old copy,
// however old. Three numbers and a character per kanji — the subjects
// themselves, with their meanings and mnemonics, are never kept.

import { getAllKanjiSubjects } from './wanikani.js'

const KEY = 'kanigami-kanji'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// [id, level, character], for every kanji with a character.
export function compact(subjects = []) {
  return subjects
    .filter(s => s?.data?.characters && typeof s.data.level === 'number')
    .map(s => [s.id, s.data.level, s.data.characters])
}

export function isComplete(record) {
  return Boolean(record && typeof record.at === 'number' && Array.isArray(record.kanji) && record.kanji.length > 0)
}

export function isFresh(record, now) {
  return isComplete(record) && now - record.at < WEEK_MS
}

export async function kanjiIndex(token, now = Date.now()) {
  let held = null
  try {
    held = JSON.parse(localStorage.getItem(KEY))
  } catch {
    // Unreadable is the same as absent.
  }
  if (isFresh(held, now)) return held.kanji

  let record
  try {
    record = { at: now, kanji: compact(await getAllKanjiSubjects(token)) }
  } catch (problem) {
    if (isComplete(held)) return held.kanji
    throw problem
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // No storage: this visit still has the index.
  }
  return record.kanji
}

// How much of a kanji list you have been taught — and how much you will have
// been once WaniKani has taught you through a later level.
//
// "Taught" is the board's word: a lesson done, the same count as the taught
// section. `index` is kanjiIndex's [id, level, character] for every kanji
// WaniKani teaches; `lists` is one of kanjiLists' groupings.

// The characters of every kanji you have started.
export function taughtKanji(index = [], assignments = []) {
  const byId = new Map(index.map(([id, , character]) => [id, character]))
  const taught = new Set()
  for (const a of assignments) {
    const d = a?.data
    if (d?.subject_type !== 'kanji' || !d.started_at) continue
    const character = byId.get(d.subject_id)
    if (character) taught.add(character)
  }
  return taught
}

// Everything taught already, and every kanji WaniKani teaches through
// `level`. A projection: it assumes every lesson up to there is done.
export function throughLevel(index = [], taught = new Set(), level = 0) {
  const all = new Set(taught)
  for (const [, at, character] of index) if (at <= level) all.add(character)
  return all
}

// One row per group of the list: how many of its kanji are in `characters`.
export function coverage(lists = [], characters = new Set()) {
  return lists.map(([name, kanji]) => {
    const all = [...kanji]
    return { name, total: all.length, have: all.filter(k => characters.has(k)).length }
  })
}

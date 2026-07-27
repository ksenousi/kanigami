// WaniKani's SRS stages, named.
//
// This is a lookup table and nothing else. The numbers come back in the
// POST /reviews response; this file only puts English on them. Nothing here
// decides what stage an item moves to, or when it comes back — that is
// WaniKani's to decide and ours to read.

const STAGES = [
  'initiate',
  'apprentice I',
  'apprentice II',
  'apprentice III',
  'apprentice IV',
  'guru I',
  'guru II',
  'master',
  'enlightened',
  'burned'
]

export function stageName(stage) {
  return STAGES[stage] ?? `stage ${stage}`
}

// The one dim line of type under a completed item. Null rather than a guess
// when the response did not carry both stages — an empty line is honest and
// an invented one is not.
export function movement(review) {
  const from = review?.starting_srs_stage
  const to = review?.ending_srs_stage
  if (typeof from !== 'number' || typeof to !== 'number') return null
  return `${stageName(from)} → ${stageName(to)}`
}

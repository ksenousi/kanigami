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
// when the response did not carry a stage — an empty line is honest and an
// invented one is not.
//
// A review answers with where the item came from and where it went. A started
// lesson answers with an assignment, which has only the one stage it is now
// at; there is no movement to report because there was nowhere to move from.
export function movement(resource) {
  const from = resource?.starting_srs_stage
  const to = resource?.ending_srs_stage
  if (typeof from === 'number' && typeof to === 'number') {
    return `${stageName(from)} → ${stageName(to)}`
  }
  if (typeof resource?.srs_stage === 'number') return stageName(resource.srs_stage)
  return null
}

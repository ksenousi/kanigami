// WaniKani's SRS stages, named.
//
// This is a lookup table and nothing else. The numbers are WaniKani's, read
// off an assignment; this file only puts English on them.

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

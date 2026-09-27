// What a subject looks like on screen, as plain data.
//
// This lives in lib rather than in the component because the awkward case
// is data-shaped, not React-shaped: a radical with no codepoint. The
// component reads the answer.

// 'kana_vocabulary' is vocabulary as far as the eye is concerned — the
// colour it is set in and the column it is counted in.
export function subjectTypeName(type) {
  return type === 'kana_vocabulary' ? 'vocabulary' : type
}

// Some radicals have no Unicode character at all. WaniKani ships stroke
// images for those; prefer the SVG, which is the only one that survives being
// scaled to display size.
export function glyphFor(subject) {
  if (subject.characters) return { text: subject.characters, image: null }

  const images = subject.character_images ?? []
  const chosen = images.find(image => image.content_type === 'image/svg+xml') ?? images.at(-1)
  return { text: null, image: chosen?.url ?? null }
}

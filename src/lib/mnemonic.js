// WaniKani's mnemonics arrive as markup, and this turns them into data.
//
// This is the one real XSS surface in the app. The token sits in
// localStorage on a public origin, so any script that runs on the page can
// read it — and mnemonics are the only place where markup from elsewhere
// reaches the DOM. `dangerouslySetInnerHTML` is therefore not an option, and
// neither is stripping the tags out: the emphasis is load-bearing for
// memorisation, and a mnemonic reduced to plain text is a worse mnemonic.
//
// So: parse to a flat list of `{ text, tag }`, and let React set every piece
// as a text node. Nothing here ever produces HTML, which is what makes the
// whole question moot rather than merely handled.
//
//   parse('Look, a <radical>lid</radical>.')
//     → [{ text: 'Look, a ', tag: null },
//        { text: 'lid', tag: 'radical' },
//        { text: '.', tag: null }]

// The tags WaniKani actually uses. Anything else is somebody's angle bracket
// and is treated as the text it looks like.
const TAGS = new Set(['radical', 'kanji', 'vocabulary', 'reading', 'meaning', 'ja'])

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)>/g

export function parse(source) {
  if (typeof source !== 'string' || source === '') return []

  const nodes = []
  const open = []
  let cursor = 0

  const take = text => {
    if (!text) return
    const tag = open.length > 0 ? open[open.length - 1] : null
    const last = nodes[nodes.length - 1]
    // Adjacent runs under the same tag are one node — an unknown tag in the
    // middle of a sentence should not split it into three.
    if (last && last.tag === tag) last.text += text
    else nodes.push({ text, tag })
  }

  for (const match of source.matchAll(TAG_PATTERN)) {
    const [whole, closing, name] = match
    const tag = name.toLowerCase()

    if (!TAGS.has(tag)) continue // left in place, taken as text below

    take(source.slice(cursor, match.index))
    cursor = match.index + whole.length

    if (closing) {
      // Only pop a tag that is actually open. A stray close tag is malformed
      // markup, not an instruction to unwind something else.
      const at = open.lastIndexOf(tag)
      if (at !== -1) open.splice(at, 1)
    } else {
      open.push(tag)
    }
  }

  take(source.slice(cursor))
  return nodes
}

// The plain reading of a mnemonic, for anywhere that cannot take spans —
// an aria-label, a title. Never for rendering the mnemonic itself.
export function flatten(source) {
  return parse(source)
    .map(node => node.text)
    .join('')
}

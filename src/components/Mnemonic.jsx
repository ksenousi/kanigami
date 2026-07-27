import { parse } from '../lib/mnemonic.js'

// WaniKani's mnemonics, set as prose.
//
// Every piece arrives here as a string and leaves as a text node — React
// escapes all of it, and nothing in this file can produce markup. That is the
// whole defence, and it is structural rather than careful: there is no code
// path here that could emit HTML even if the input asked for it.
export default function Mnemonic({ source, label }) {
  const nodes = parse(source)
  if (nodes.length === 0) return null

  return (
    <div className="mnemonic-block">
      {label ? <p className="mnemonic-label">{label}</p> : null}
      <p className="mnemonic">
        {nodes.map((node, index) =>
          node.tag ? (
            <span key={index} className={`m-${node.tag}`}>
              {node.text}
            </span>
          ) : (
            node.text
          )
        )}
      </p>
    </div>
  )
}

// Nothing about a grid of characters, a row of bars or a strip of hours says
// pointing at one does anything, so the resting lines say so, in the verb the
// device has. Both are written and CSS shows the one that fits — `hover: none`
// is a finger.
export default function Hint({ pointer, touch, children }) {
  return (
    <span className="hint">
      <span className="by-pointer">{pointer}</span>
      <span className="by-touch">{touch}</span> {children}
    </span>
  )
}

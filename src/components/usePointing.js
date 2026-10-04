import { useEffect, useRef, useState } from 'react'

// Which item of a readout group — the kanji grid, the pace bars, the
// forecast's hours — is being pointed at, by mouse, finger, or keyboard.
//
// A mouse reads on hover and lets go on leaving, as before. **A finger has
// no hover**, and pointer events give it one anyway: a tap fires enter, down,
// up and leave in a row, so a readout wired to enter and leave flashes for a
// frame and is gone. On touch the item a tap lands on stays read until the
// same item is tapped again or the tap lands anywhere outside the group.
//
// `onChange` hears every change, for a parent that shows the readout itself.
// The component keeps its own arrow keys and calls `point` from them.
export default function usePointing(onChange) {
  const [at, setAt] = useState(null)
  const group = useRef(null)
  const heard = useRef(onChange)
  heard.current = onChange

  function point(i) {
    setAt(i)
    heard.current?.(i)
  }

  // Only the group holding something lets go of it. The kanji and the
  // radicals share one readout, and a blur or a leave from the idle one would
  // otherwise wipe what the other has just shown.
  function letGo() {
    if (at !== null) point(null)
  }

  // A tap outside lets go. Only while something is read, so a page of idle
  // groups adds no listeners — and in the capture phase, so it lets go
  // before a tap on a neighbouring group points at something new.
  useEffect(() => {
    if (at === null) return
    function away(event) {
      if (!group.current?.contains(event.target)) {
        setAt(null)
        heard.current?.(null)
      }
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [at])

  const groupProps = {
    ref: group,
    tabIndex: 0,
    onPointerLeave: event => {
      if (event.pointerType === 'mouse') letGo()
    },
    onBlur: letGo
  }

  const itemProps = i => ({
    onPointerEnter: event => {
      if (event.pointerType === 'mouse') point(i)
    },
    onPointerDown: event => {
      if (event.pointerType !== 'mouse') point(at === i ? null : i)
    }
  })

  return { at, point, groupProps, itemProps }
}

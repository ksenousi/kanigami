import { useEffect, useRef } from 'react'
import { toKana } from 'wanakana'

// A hairline, not a box.
//
// Focus never leaves this field during a session, so the rule cannot light on
// focus the way it does on the token gate — it would simply be lit the whole
// time. Here it lights when there is a verdict to report, which is what
// `.field.review` in the stylesheet arranges.
//
// Reading questions convert romaji as they are typed. IMEMode leaves a
// trailing consonant alone so `ka` becomes か without `k` flickering through
// something else on the way.
//
// Once an answer is judged the field goes read-only rather than disabled: a
// disabled input drops focus, and the next Enter has to land here to advance.
//
// `lit` carries the verdict rather than a boolean, because the rule reports
// which verdict it is: celadon for right, vermilion for wrong.
//
// The field is as wide as what is in it. The width comes from `.grow`, which
// holds a hidden copy of the same text in the same grid cell as the input —
// see the stylesheet for why the copy and not a character count. All this
// component owes it is the current text, or the placeholder while there is
// none, since the resting width should fit the word standing there.
export default function AnswerField({
  value,
  onChange,
  onEnter,
  kana,
  lit,
  locked,
  paused,
  placeholder,
  focusKey
}) {
  const input = useRef(null)

  useEffect(() => {
    input.current?.focus()
  }, [focusKey])

  // Enter is handled here rather than left to the form's implicit submission,
  // which browsers only perform under conditions this field cannot promise.
  // Preventing the default is what stops the two paths both firing.
  function keyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onEnter()
  }

  return (
    // `locked` after a verdict looks no different, and should not — the
    // answer stands there to be read. `paused` is the other reason the field
    // stops taking keys, and that one has to show, or an offline session just
    // silently swallows typing.
    <div className={paused ? 'field review paused' : 'field review'}>
      <div className="grow" data-value={value || placeholder}>
        <input
          ref={input}
          type="text"
          value={value}
          onChange={event => onChange(kana ? toKana(event.target.value, { IMEMode: true }) : event.target.value)}
          onKeyDown={keyDown}
          lang={kana ? 'ja' : 'en'}
          placeholder={placeholder}
          aria-label={kana ? 'Reading' : 'Meaning'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          readOnly={locked}
          // An input carries an intrinsic width of `size` characters, and a
          // grid track is sized by what its items intrinsically want. Left at
          // the default 20 the track never measures anything narrower, so the
          // hidden copy would only ever widen the field past twenty
          // characters and never set it. This makes the input want nothing.
          size={1}
        />
      </div>
      <div className={ruleClass(lit)} />
    </div>
  )
}

// `lit` is the verdict, not a boolean: null while asking, then 'correct' or
// 'incorrect'. The two do not share a colour, which is the whole point —
// vermilion fired on every answer before and so reported nothing.
function ruleClass(lit) {
  if (!lit) return 'rule'
  return lit === 'correct' ? 'rule lit ok' : 'rule lit'
}

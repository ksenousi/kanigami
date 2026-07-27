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
export default function AnswerField({
  value,
  onChange,
  onEnter,
  kana,
  lit,
  locked,
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
    <div className="field review">
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
      />
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

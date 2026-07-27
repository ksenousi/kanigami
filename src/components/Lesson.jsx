import { useEffect, useState } from 'react'
import { acceptedAnswers, glyphFor, readingTypeLabel, subjectTypeName } from '../lib/subject.js'
import Mnemonic from './Mnemonic.jsx'

// 紙 Paper — the lesson surface.
//
// Lessons are reading material, so they are typeset rather than laid out: a
// book spread, verso and recto, mincho throughout, seal red where the ink
// surface would use vermilion. The quiz that follows is a quiz and stays on
// the ink surface where quizzes live.
//
// Nothing here writes. The batch is read, and then the caller is handed the
// session to quiz — starting an assignment happens on the far side of that.
export default function Lesson({ items, onQuiz, onExit }) {
  const [at, setAt] = useState(0)
  const item = items[at]
  const last = at === items.length - 1

  // Left and right walk the spread; Enter moves on and, at the end, into the
  // quiz. The keyboard gets through a batch without reaching for the mouse.
  useEffect(() => {
    function key(event) {
      if (event.key === 'ArrowLeft') setAt(n => Math.max(0, n - 1))
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        if (last && event.key === 'Enter') onQuiz()
        else setAt(n => Math.min(items.length - 1, n + 1))
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [last, items.length, onQuiz])

  return (
    <div className="surface-paper">
      <header className="runninghead">
        <span>{subjectTypeName(item.type)} · level {item.subject.level ?? '—'}</span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={onExit}>
          Leave
        </button>
      </header>

      <div className="spread">
        {/* The context sentences sit under the character rather than at the
            bottom of the recto. The recto was running past the fold on any
            subject with two long mnemonics while this column stopped a third
            of the way down — one page overflowing beside an empty one. */}
        <div className="verso">
          <Face subject={item.subject} />
          <p className="stat">{glyphCount(item.subject)}</p>
          <Sentences sentences={item.subject.context_sentences} />
        </div>

        <div className="recto">
          <h1 className="gloss">{acceptedAnswers(item.subject, 'meaning').join(', ')}</h1>

          <Readings subject={item.subject} />

          {/* Labelled, because a real subject carries two of these and they
              are otherwise two untitled paragraphs of similar length. On a
              long one you cannot tell where the meaning ends. */}
          <Mnemonic source={item.subject.meaning_mnemonic} label="meaning" />
          <Mnemonic source={item.subject.reading_mnemonic} label="reading" />
        </div>
      </div>

      <div className="folio">
        <span>{at + 1} / {items.length}</span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={() => setAt(n => Math.max(0, n - 1))} disabled={at === 0}>
          Back
        </button>
        <button type="button" onClick={() => (last ? onQuiz() : setAt(n => n + 1))}>
          {last ? 'Quiz' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// The character at reading size, with its reading over it. Furigana proper
// would need per-kanji alignment that the API does not carry, so the ruby
// sits over the whole word — which is what it is a reading of.
function Face({ subject }) {
  const { text, image } = glyphFor(subject)
  const primary = primaryReading(subject)
  // Kana-only vocabulary is its own reading. Ruby over it would set the same
  // word twice, one of them smaller.
  const reading = primary === text ? null : primary

  if (!text) {
    return (
      <div className="face">
        {image ? <img src={image} alt="" aria-hidden="true" /> : <span>〓</span>}
      </div>
    )
  }

  return (
    <div className="face">
      {reading ? (
        <ruby>
          {text}
          <rt>{reading}</rt>
        </ruby>
      ) : (
        text
      )}
    </div>
  )
}

function Readings({ subject }) {
  const readings = (subject.readings ?? []).filter(r => r.accepted_answer)
  if (readings.length === 0) return null

  const label = readingTypeLabel(readings)

  return (
    <p className="readings">
      {label ? <span className="label">{label}</span> : null}
      {readings.map(r => r.reading).join('、')}
    </p>
  )
}

// Against a seal-red left rule, which is the one place a field of that colour
// is allowed on this surface.
function Sentences({ sentences }) {
  const shown = (sentences ?? []).slice(0, 2)
  if (shown.length === 0) return null

  return (
    <div className="sentences">
      {shown.map((sentence, index) => (
        <blockquote key={index}>
          <p className="ja">{sentence.ja}</p>
          <p className="en">{sentence.en}</p>
        </blockquote>
      ))}
    </div>
  )
}

function primaryReading(subject) {
  const readings = (subject.readings ?? []).filter(r => r.accepted_answer)
  return (readings.find(r => r.primary) ?? readings[0])?.reading ?? null
}

// The API carries no stroke count, so the honest equivalent is what is
// actually there: how many characters the word is written with.
function glyphCount(subject) {
  const characters = subject.characters
  if (!characters) return 'drawn'
  const count = [...characters].length
  return count === 1 ? '1 character' : `${count} characters`
}

import { useEffect, useRef, useState } from 'react'
import { acceptedAnswers, glyphFor, readingTypeLabel, subjectTypeName } from '../lib/subject.js'
import Mnemonic from './Mnemonic.jsx'
import useFaces from './useFaces.js'

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
  const { faces } = useFaces()
  const prose = useRef(null)
  const item = items[at]
  const last = at === items.length - 1

  // Left and right walk the spread; Enter moves on and, at the end, into the
  // quiz. Down and up walk the prose when it runs past the fold — the page
  // itself is pinned and cannot scroll, so without these the keyboard could
  // start a long mnemonic and never finish it. The keyboard gets through a
  // batch without reaching for the mouse.
  useEffect(() => {
    function key(event) {
      // Enter on a focused button already fires that button's onClick, and
      // Next and Quiz are bound to the same actions this handler runs — so
      // without the guard, tabbing to Next and pressing Enter advanced twice
      // and skipped a subject silently, and Enter on Back at the last card
      // went back *and* entered the quiz.
      if (event.target !== document.body) return
      if (event.key === 'ArrowLeft') setAt(n => Math.max(0, n - 1))
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        if (last && event.key === 'Enter') onQuiz()
        else setAt(n => Math.min(items.length - 1, n + 1))
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const region = prose.current
        if (!region) return
        // Most of a window of prose, so consecutive lines are never orphaned
        // on either side of a step. Behaviour comes from the stylesheet,
        // where reduced motion already turns it off.
        const step = Math.round(region.clientHeight * 0.6)
        region.scrollBy({ top: event.key === 'ArrowDown' ? step : -step })
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
            bottom of the recto, balancing the spread — and they are the
            verso's one flexible block, so they are the part that flows when
            a narrow window leaves them no room. The character stands. */}
        <div className="verso">
          <Face subject={item.subject} />
          <p className="stat">{glyphCount(item.subject)}</p>
          <Collection subject={item.subject} faces={faces} />
          <Flow key={`v${at}`}>
            <Sentences sentences={item.subject.context_sentences} />
          </Flow>
        </div>

        <div className="recto">
          {/* Keyed by position so a new subject opens at the top of its own
              page with the fold measured fresh — a remount, not a reset,
              because a reset is a second thing to keep in step. */}
          <Flow key={at} regionRef={prose}>
            <h1 className="gloss">{acceptedAnswers(item.subject, 'meaning').join(', ')}</h1>

            <Readings subject={item.subject} />

            {/* Labelled, because a real subject carries two of these and they
                are otherwise two untitled paragraphs of similar length. On a
                long one you cannot tell where the meaning ends. */}
            <Mnemonic source={item.subject.meaning_mnemonic} label="meaning" />
            <Mnemonic source={item.subject.reading_mnemonic} label="reading" />
          </Flow>
        </div>
      </div>

      <div className="folio">
        <span>{at + 1} / {items.length}</span>
        {/* Home names the key under each door; the lesson had the same
            keyboard path and named none of it. */}
        <span className="keys">← →</span>
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

// A flowing region under a fold that says so.
//
// The page is a place: it is pinned to the window and the reading matter
// alone moves, inside this region. The fold beneath it is the house
// hairline — lit with `more ↓` while prose remains below the window, back
// to the quiet rule at the end, and not drawn at all when everything fits.
// The state is measured, never assumed: on scroll, when the region's box
// changes with the window, and when its children change height — which is
// what a webfont arriving late does to a paragraph that was measured in
// the fallback face.
function Flow({ children, regionRef }) {
  const region = useRef(null)
  const [fold, setFold] = useState('fits')

  useEffect(() => {
    const el = region.current
    function update() {
      const over = el.scrollHeight - el.clientHeight
      // A few pixels of tolerance on both edges: line-height rounding can
      // leave a fitting page 2–4px "scrollable", and a fold that lights for
      // pixels nobody can read teaches the eye to ignore the lit rule.
      setFold(
        over < 8 ? 'fits'
        : el.scrollTop + el.clientHeight < el.scrollHeight - 4 ? 'more'
        : 'end'
      )
    }
    update()
    const watch = new ResizeObserver(update)
    watch.observe(el)
    for (const child of el.children) watch.observe(child)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      watch.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  // The caller may need the scroller too — the keyboard walks the recto's
  // prose from the window handler.
  function hold(el) {
    region.current = el
    if (regionRef) regionRef.current = el
  }

  return (
    <div className="flows">
      <div className="flow" ref={hold}>
        {children}
      </div>
      {/* Decoration to a screen reader — the prose itself is ordinary flow
          content and needs no announcement to be reached. */}
      <div className={`fold ${fold}`} aria-hidden="true">
        <span className="rule" />
        <span className="hint">more ↓</span>
      </div>
    </div>
  )
}

// The same character in every face at once.
//
// The review varies the face one card at a time, which is retrieval practice
// under changing conditions. This is the other half and it belongs here,
// where you are meeting the character rather than being tested on it: side
// by side, what is identical across all four *is* the character and what
// differs is the typeface's opinion. Comparison is what makes that split
// visible, and it is exactly what the review must not offer.
//
// Only for characters. A radical drawn as a stroke image has no typeface to
// vary, and one face is not a collection — with the fonts blocked this would
// otherwise be the same drawing repeated, which teaches the opposite lesson.
function Collection({ subject, faces }) {
  const { text } = glyphFor(subject)
  if (!text || faces.length < 2) return null

  return (
    <div className="collection" aria-hidden="true">
      {faces.map(face => (
        <figure key={face.key}>
          <span className="ch" style={{ fontFamily: face.stack }}>
            {text}
          </span>
          <figcaption>{face.label}</figcaption>
        </figure>
      ))}
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

import { useState } from 'react'
import { answer, nextQuestion, sessionProgress } from '../lib/session.js'
import { grade } from '../lib/grade.js'
import { acceptedAnswers, questionLine, subjectTypeName } from '../lib/subject.js'
import AnswerField from './AnswerField.jsx'
import Glyph from './Glyph.jsx'

// The ink surface, wired to the session engine and the grader.
//
// Enter submits, Enter again advances, and focus never leaves the field. That
// is exactly the double-fire `answer()` guards against, so the question the
// screen is showing is handed back to it rather than looked up again: while a
// verdict is on screen the session has already moved on, and the second Enter
// never reaches the grader at all.
//
// The grader's third verdict is a UI state and not an error. 'retry' lights
// nothing, counts nothing, and leaves what was typed alone to be corrected.
export default function Review({ session: opening, synonyms = {}, onExit }) {
  const [session, setSession] = useState(opening)
  const [typed, setTyped] = useState('')
  const [judged, setJudged] = useState(null)
  const [nudge, setNudge] = useState(null)

  // While a verdict is showing, `session` is already the next generation —
  // the question on screen is the one held in `judged`.
  const asking = judged ? null : nextQuestion(session)
  const showing = judged?.question ?? asking
  const progress = sessionProgress(session)

  function submit() {
    if (judged) {
      setJudged(null)
      setTyped('')
      return
    }
    if (!asking) return

    const { verdict, hint } = grade({
      subject: asking.subject,
      questionType: asking.questionType,
      input: typed,
      synonyms: synonyms[asking.item.subjectId] ?? []
    })

    if (verdict === 'retry') {
      setNudge(hint)
      return
    }

    setSession(answer(session, asking, verdict))
    setJudged({
      question: asking,
      verdict,
      answers: acceptedAnswers(asking.subject, asking.questionType)
    })
    setNudge(null)
  }

  return (
    <div className="surface-ink">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="sp" />
        <button className="quiet" type="button" onClick={onExit}>
          {showing ? 'Wrap up' : 'Done'}
        </button>
      </header>

      <div className="centred">
        {showing ? (
          <>
            <p className={`question wk-${subjectTypeName(showing.item.type)}`}>
              {questionLine(showing.item, showing.questionType)}
            </p>

            <Glyph subject={showing.subject} />

            <form onSubmit={event => event.preventDefault()}>
              <AnswerField
                value={typed}
                onChange={next => {
                  setTyped(next)
                  setNudge(null)
                }}
                onEnter={submit}
                kana={showing.questionType === 'reading'}
                lit={Boolean(judged)}
                locked={Boolean(judged)}
                focusKey={judged ? 'judged' : `${asking.item.subjectId}:${asking.questionType}`}
              />
            </form>

            <div className="judgement" aria-live="polite">
              {judged ? <Verdict judged={judged} /> : nudge ? <p className="eyebrow hot">{nudge}</p> : null}
            </div>
          </>
        ) : (
          // Phase 7 replaces this with the session wrap. Until then, the
          // honest minimum: it is over, and nothing was sent anywhere.
          <>
            <div className="glyph">終</div>
            <p className="eyebrow">{progress.total} items · session finished</p>
            <p className="lede">
              Nothing has been submitted to WaniKani — the write path opens in a later phase.
            </p>
          </>
        )}
      </div>

      <div className="footline">
        <span>復習</span>
        <span className="track" />
        <span>{progress.remaining} left</span>
      </div>
    </div>
  )
}

// Correct and incorrect both light the same rule — there is one accent in
// this surface and no red flood. The line of type is what differs, and the
// accepted answer appears either way: getting it wrong is when you most need
// to see it.
function Verdict({ judged }) {
  const separator = judged.question.questionType === 'reading' ? '、' : ', '

  return (
    <>
      <p className={judged.verdict === 'correct' ? 'eyebrow' : 'eyebrow hot'}>
        {judged.verdict === 'correct' ? 'correct' : 'incorrect · it comes back'}
      </p>
      <p className="answers">{judged.answers.join(separator)}</p>
    </>
  )
}

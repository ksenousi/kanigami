import { useEffect, useState } from 'react'
import { answer, nextQuestion, sessionProgress } from '../lib/session.js'
import { grade } from '../lib/grade.js'
import { movement } from '../lib/srs.js'
import { acceptedAnswers, echoesAnswer, questionParts, subjectTypeName } from '../lib/subject.js'
import { FACES, faceFor } from '../lib/faces.js'
import useFaces from './useFaces.js'
import AnswerField from './AnswerField.jsx'
import Glyph from './Glyph.jsx'
import useOnline from './useOnline.js'

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
//
// The screen never talks to the API. It hands completed items to `submitter`,
// which decides whether anything is actually sent — so a session can be run
// with a submitter that only logs, which is the default and the point.
export default function Review({ session: opening, synonyms = {}, submitter, onExit }) {
  const [session, setSession] = useState(opening)
  const [typed, setTyped] = useState('')
  const [judged, setJudged] = useState(null)
  const [nudge, setNudge] = useState(null)
  const [sync, setSync] = useState(() => submitter.state())
  // How many questions this screen has put up, which is what rotates the
  // face. Counted here rather than derived from the session, because a
  // missed item comes round again and should not come back in the face it
  // was missed in — that would let the face itself become the cue.
  const [asked, setAsked] = useState(0)
  const faces = useFaces()
  const online = useOnline()

  useEffect(() => submitter.watch(setSync), [submitter])

  // Nothing left to ask. The wrap takes it from here — this screen has no
  // finished state of its own, which is why it cannot disagree with the one
  // the wrap draws.
  const done = !judged && nextQuestion(session) === null
  useEffect(() => {
    if (done) onExit(session)
  }, [done, session, onExit])

  // While a verdict is showing, `session` is already the next generation —
  // the question on screen is the one held in `judged`.
  const asking = judged ? null : nextQuestion(session)
  const showing = judged?.question ?? asking
  const progress = sessionProgress(session)

  function submit() {
    // Paused. Answers already given are held by the submitter and will go
    // when the network does; taking new ones would be answering into a void.
    if (!online) return

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

    const next = answer(session, asking, verdict)
    setSession(next)

    // Both questions right. Submit now rather than at the end of the session:
    // a tab closed halfway through should lose the queue and nothing else.
    if (next.justCompleted) submitter.push(next.justCompleted)

    setAsked(n => n + 1)
    setJudged({
      question: asking,
      verdict,
      answers: acceptedAnswers(asking.subject, asking.questionType),
      typed,
      completed: Boolean(next.justCompleted)
    })
    setNudge(null)
  }

  return (
    <div className="surface-ink">
      <header className="masthead">
        <span className="wordmark">蟹紙</span>
        <span className="sp" />
        {/* Ends the session early. Everything finished is already submitted,
            so there is nothing to lose by stopping. */}
        <button className="quiet" type="button" onClick={() => onExit(session)}>
          Wrap up
        </button>
      </header>

      <div className={judged?.verdict === 'correct' ? 'centred ok' : 'centred'}>
        {showing ? (
          <>
            <Question item={showing.item} questionType={showing.questionType} />

            {/* One face per question, rotating. The character is the thing
                being tested, so it is the thing that varies — see faces.js
                for why this is the review's job and the collection is the
                lesson's. */}
            <Glyph subject={showing.subject} face={faceFor(asked, faces)} />

            <form onSubmit={event => event.preventDefault()}>
              <AnswerField
                value={typed}
                onChange={next => {
                  setTyped(next)
                  setNudge(null)
                }}
                onEnter={submit}
                kana={showing.questionType === 'reading'}
                // A second, quieter answer to the same question, sitting
                // where the eye already is at the moment of typing.
                placeholder={showing.questionType === 'reading' ? 'かな' : 'meaning'}
                lit={judged?.verdict ?? null}
                locked={Boolean(judged) || !online}
                paused={!online}
                focusKey={judged ? 'judged' : `${asking.item.subjectId}:${asking.questionType}`}
              />
            </form>

            <div className="judgement" aria-live="polite">
              {judged ? (
                <Verdict judged={judged} outcome={sync.results[showing.item.subjectId]} />
              ) : nudge ? (
                <p className="eyebrow hot">{nudge}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {/* The pause belongs here and not in the judgement slot. It used to
          render as `.eyebrow.hot` where a verdict goes — same position, same
          size, same vermilion as `incorrect · it comes back` — so typing an
          answer while offline produced something that read as a miss. The
          footline already reports what the session is doing. */}
      <div className="footline" role="status">
        {/* Plain, not accented. `submitting` used to take the accent to mark
            a session that had the dry run switched off — worth shouting when
            that was a deliberate, unusual act. In a built app it is every
            session, and a permanent vermilion word on the surface where
            vermilion means *wrong* is a collision rather than a warning. The
            accent stays on the thing that is genuinely exceptional: answers
            that failed to send. */}
        {online ? (
          <span>{sync.dryRun ? 'dry run' : 'submitting'}</span>
        ) : (
          <span>offline · paused, nothing answered is lost</span>
        )}
        <span className="track" />
        <span>
          {/* Home carries the explanation; here it is one more exceptional
              thing alongside unsent answers, in the same register. */}
          {faces.length < FACES.length ? (
            <span className="live">{faces.length} of {FACES.length} typefaces · </span>
          ) : null}
          {sync.failed.length > 0 ? (
            <span className="live">{sync.failed.length} unsent · </span>
          ) : null}
          {sync.syncing > 0 ? `${sync.syncing} syncing · ` : ''}
          {progress.remaining} {progress.remaining === 1 ? 'item' : 'items'} left
        </span>
      </div>
    </div>
  )
}

// What is being asked, above the glyph.
//
// The two question types used to differ by one word set exactly like every
// word beside it, so telling them apart meant reading a line of 13px mono.
// Now the asked thing is the loud part — larger, in the display ink — and the
// subject type stays quiet in its own colour beside it. The third piece
// answers *which*: the reading's type when the accepted readings agree on
// one, and otherwise how many answers will do.
function Question({ item, questionType }) {
  const { kind, asked, hint } = questionParts(item, questionType)

  return (
    <p className={`question wk-${subjectTypeName(item.type)}`}>
      <span className="kind">{kind}</span>
      <span className={`asked ${asked}`}>{asked}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </p>
  )
}

// The two verdicts do not share a colour: celadon for right, vermilion for
// wrong, on the rule, the verdict line and the accepted answer together. That
// hue split is the entire signal — no shake, no red flood, and deliberately
// nothing stacked on top of it. The accepted answer appears either way, since
// getting it wrong is when you most need to see it.
function Verdict({ judged, outcome }) {
  const separator = judged.question.questionType === 'reading' ? '、' : ', '
  const right = judged.verdict === 'correct'
  // A right answer with one accepted form printed that form again, 30px under
  // a field already showing it. Suppressed only in that exact case: a second
  // accepted meaning, or a synonym that was taken, is still worth seeing.
  const echo = right && echoesAnswer(judged.typed, judged.answers)
  // Latin meanings used to arrive in mincho — the app's only Latin serif, in
  // the state that most wants plain reading. The Japanese keeps the serif.
  const latin = judged.question.questionType === 'meaning'

  return (
    <>
      <p className={right ? 'eyebrow ok' : 'eyebrow hot'}>
        {right ? 'correct' : 'incorrect · it comes back'}
      </p>
      {echo ? null : (
        <p className={['answers', latin ? 'latin' : '', right ? 'ok' : ''].filter(Boolean).join(' ')}>
          {judged.answers.join(separator)}
        </p>
      )}
      {judged.completed ? <p className="movement">{movementLine(outcome)}</p> : null}
    </>
  )
}

// One dim line under a finished item, and only ever what came back — the
// stages are read out of WaniKani's response and never worked out here. It
// arrives a beat after the answer, so there is a word for the wait.
function movementLine(outcome) {
  if (!outcome) return 'submitting'
  if (outcome.status === 'dry-run') return 'dry run · nothing sent'
  if (outcome.status === 'skipped') return outcome.message
  if (outcome.status === 'failed') return 'not submitted · still to sync'
  return movement(outcome.review) ?? 'submitted'
}

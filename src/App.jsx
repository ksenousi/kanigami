import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Home from './components/Home.jsx'
import Review from './components/Review.jsx'
import Lesson from './components/Lesson.jsx'
import Wrap from './components/Wrap.jsx'
import { getUser, startAssignment, submitReview } from './lib/wanikani.js'
import { loadLessonBatch, loadReviewSession } from './lib/queue.js'
import { createSubmitter, startLine } from './lib/submit.js'
import { clearToken, readToken } from './lib/token.js'

export default function App() {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(Boolean(readToken()))
  // A loaded session and its synonyms. There is no router, so which screen
  // the app is on is this being null or not.
  const [review, setReview] = useState(null)
  // A lesson batch is read first and quizzed second, so it carries which of
  // the two it is in.
  const [lesson, setLesson] = useState(null)
  // A finished session, held for the wrap. It carries the submitter too, so
  // the wrap can say what is still in flight.
  const [wrap, setWrap] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  // Dry run is a development gate, not a feature, and it does not ship.
  //
  // In dev it is on and starts on again after every reload: turning it off is
  // a decision to write to a real account, and that decision should not
  // survive a refresh by accident. In a built app it is off and there is no
  // control for it — somebody doing their reviews on the deployed site wants
  // them recorded, and a client that grades you and then quietly throws the
  // answer away is broken rather than careful.
  //
  // What does not change is `createSubmitter`'s own default, which is still
  // dry run. That is the structural safety: code that forgets to think about
  // this writes nothing. This line is the one caller that has thought about
  // it.
  const [dryRun, setDryRun] = useState(import.meta.env.DEV)

  // A token from a previous visit still has to be proven against the API —
  // it may have been revoked since.
  useEffect(() => {
    if (!token || user) return
    let live = true
    getUser(token)
      .then(data => {
        if (!live) return
        setUser(data)
        setRestoring(false)
      })
      .catch(() => {
        if (!live) return
        clearToken()
        setToken('')
        setRestoring(false)
      })
    return () => {
      live = false
    }
  }, [token, user])

  // Back to the gate. The wrap is left standing until the user leaves it,
  // so a revoked token does not also take the record of what went unsent.
  function disconnect() {
    clearToken()
    setToken('')
    setUser(null)
    setReview(null)
    setLesson(null)
  }

  // Both submitters are built here, once per session, because this is the
  // only place holding both the token and the dry-run decision. Neither
  // screen sees either.
  async function start(load, build, empty) {
    setLoading(true)
    setLoadError('')
    try {
      const loaded = await load()
      if (loaded.session.items.length === 0) setLoadError(empty)
      else build(loaded)
    } catch (problem) {
      setLoadError(problem.message)
    }
    setLoading(false)
  }

  function startReview() {
    return start(
      () => loadReviewSession(token),
      loaded =>
        setReview({
          ...loaded,
          submitter: createSubmitter({
            send: review => submitReview(token, review),
            dryRun
          })
        }),
      'Nothing is due right now.'
    )
  }

  function startLessons() {
    return start(
      () => loadLessonBatch(token),
      loaded =>
        setLesson({
          ...loaded,
          reading: true,
          // A lesson writes to a different endpoint with a different body,
          // so its dry run says a different thing. Only `assignmentId` is
          // read; the counts a review would carry mean nothing here.
          submitter: createSubmitter({
            send: ({ assignmentId }) => startAssignment(token, assignmentId),
            describe: startLine,
            dryRun
          })
        }),
      'No lessons waiting.'
    )
  }

  if (restoring) {
    return (
      <div className="surface-ink">
        <div className="centred">
          <div className="eyebrow hot" role="status">connecting</div>
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return (
      <TokenGate
        onConnected={(newToken, newUser) => {
          setToken(newToken)
          setUser(newUser)
        }}
      />
    )
  }

  // Every session ends at the wrap, whether it ran out of questions or was
  // walked away from. Both paths land here, so there is only one ending.
  if (wrap) {
    return (
      <Wrap
        token={token}
        session={wrap.session}
        submitter={wrap.submitter}
        onDone={() => setWrap(null)}
        onDisconnect={disconnect}
      />
    )
  }

  if (review) {
    return (
      <Review
        session={review.session}
        synonyms={review.synonyms}
        submitter={review.submitter}
        onExit={finished => {
          setWrap({ session: finished, submitter: review.submitter })
          setReview(null)
        }}
      />
    )
  }

  if (lesson?.reading) {
    return (
      <Lesson
        items={lesson.items}
        onQuiz={() => setLesson(current => ({ ...current, reading: false }))}
        onExit={() => setLesson(null)}
      />
    )
  }

  // The quiz over a batch is a quiz, so it happens on the ink surface where
  // quizzes live. Its submitter starts assignments instead of posting
  // reviews; the screen cannot tell, and does not need to.
  if (lesson) {
    return (
      <Review
        session={lesson.session}
        synonyms={lesson.synonyms}
        submitter={lesson.submitter}
        onExit={finished => {
          setWrap({ session: finished, submitter: lesson.submitter })
          setLesson(null)
        }}
      />
    )
  }

  return (
    <Home
      token={token}
      user={user}
      onDisconnect={disconnect}
      onReview={startReview}
      onLearn={startLessons}
      starting={loading}
      error={loadError}
      dryRun={dryRun}
      // Absent in a built app, and Home draws no switch when it has none to
      // throw. Which build this is stays known here rather than being asked
      // again on the screen.
      onDryRun={import.meta.env.DEV ? setDryRun : null}
    />
  )
}

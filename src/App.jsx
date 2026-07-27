import { useEffect, useState } from 'react'
import TokenGate from './components/TokenGate.jsx'
import Home from './components/Home.jsx'
import Review from './components/Review.jsx'
import Lesson from './components/Lesson.jsx'
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
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  // On, and it starts on again after every reload. Turning it off is a
  // decision to write to a real account, and that decision does not survive
  // a refresh by accident.
  const [dryRun, setDryRun] = useState(true)

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
          <div className="eyebrow hot">connecting</div>
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

  if (review) {
    return (
      <Review
        session={review.session}
        synonyms={review.synonyms}
        submitter={review.submitter}
        onExit={() => setReview(null)}
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
        onExit={() => setLesson(null)}
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
      onDryRun={setDryRun}
    />
  )
}

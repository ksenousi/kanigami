# kanigami — build plan

A handoff document. Phase 0 is done and on `main`; an agent picking this up
should start at Phase 1 and work down. Each phase is independently shippable
and independently reviewable — do not collapse them into one branch.

Read **Ground rules** and **The design** first. They are the parts that words
alone make ambiguous, and getting them wrong means rebuilding the phase.

---

## What this is

A static, online-only WaniKani client. It runs entirely in the browser on
GitHub Pages, talks to `api.wanikani.com` directly (WaniKani enables CORS),
and authenticates with the user's own personal access token held in
`localStorage`. There is no server, no database, and deliberately **no
offline support** — that is a decided constraint, not a gap to fill.

Users bring their own WaniKani subscription. The app renders Tofugu's content
to the subscriber it belongs to and redistributes nothing; do not add any
feature that caches or ships WaniKani content to anyone else.

---

## Ground rules

1. **Never compute SRS stages.** `POST /reviews` reports how many times the
   user got the meaning and the reading wrong. WaniKani decides the resulting
   stage and the next review time, and returns them. Read them from the
   response; never derive them locally.
2. **Never bulk-sync the subject database.** Fetch only the subjects the
   current session is about to show, via `getSubjects(token, ids)`. A full
   sync is the offline feature we are not building.
3. **A review is two questions, one assignment.** Kanji and vocabulary are
   asked for both meaning and reading; radicals are meaning-only. Both
   questions must be answered correctly before the assignment is submitted,
   and the wrong-answer counts accumulate across retries within the session.
4. **The API allows 60 requests per minute.** `src/lib/wanikani.js` already
   throttles. Do not add a second fetch path that bypasses it.
5. **Plain JavaScript, ES modules, no TypeScript.** No semicolons, single
   quotes, two-space indent. Match the surrounding file.
6. **Keep `src/lib/` pure.** Session state machine and grading are plain
   functions over plain data — that is what makes them cheap to test. React
   lives in `src/components/`.

---

## The design

Two surfaces, one token system. Both are already declared in
`src/index.css`; extend that file rather than starting a new one.

### 墨 Ink — the review surface

The character *is* the interface. Ground `#100e0c`, text `#e6dfd0`, one
vermilion `#c8452c` hairline carrying every accent in the screen.

- The subject glyph is set in mincho at `clamp(96px, 20vw, 168px)`, weight
  300, centred, with nothing competing for attention.
- The answer field is a hairline, not a box: transparent input, 1px rule
  underneath that lights vermilion on focus. Never add a border, card, or
  filled background around it.
- The question type is a single line of letter-spaced uppercase mono above
  the glyph — `kanji · reading · on'yomi`. **This is where WaniKani's subject
  colours live**: radical `#00aaff`, kanji `#ff00aa`, vocabulary `#aa00ff`,
  applied to that line of type only. Never as a full-bleed background, which
  is precisely what we are replacing.
- Correct: the rule lights, the accepted reading appears in vermilion beneath
  it, and the SRS movement is one dim line of type (`apprentice IV → guru I`).
- Wrong: the rule stays lit in vermilion, the item returns to the queue. No
  shake, no red flood, no sound.
- Footer is one hairline track with `n left` at the right. Stats do not
  belong on this screen.

### 紙 Paper — the lesson surface

Lessons are reading material, so typeset them. Warm stock `#f3ede0`, ink
`#221f1a`, rules `#d8cfba`, seal-red accent `#9e3b26`, mincho throughout.

- Two columns, a book spread: **verso** holds the character large with its
  reading as `<ruby>`, the subject-type line, and the stroke count; **recto**
  holds the meaning as a display-size heading, the readings labelled
  on'yomi / kun'yomi, the mnemonic as real prose at ~42ch, and a context
  sentence with furigana set against a seal-red left rule.
- Mnemonics arrive from the API as `meaning_mnemonic` / `reading_mnemonic`
  containing tags like `<radical>`, `<kanji>`, `<vocabulary>`, `<reading>`,
  `<meaning>`, `<ja>`. Parse them into styled spans — do **not** dump them
  through `dangerouslySetInnerHTML`, and do not strip them to plain text
  either; the emphasis is load-bearing for memorisation.
- Running head and folio in mono at the top and bottom edges.
- On narrow screens the spread stacks: verso above, recto below.

Under 640px, both surfaces go single-column; the glyph sizes are already
fluid.

### The mark — 落款 the seal

Decided from a prototype of five directions. The app ships **no favicon at
all** today, which is the gap this closes.

The mark is a seal stamp: a full-bleed rounded square (6/64 radius, matching
the app's 2px on a 40px control) filled seal red `#9e3b26`, with 蟹 reversed
out in paper `#f3ede0` at roughly 43/64 of the box. Seal red is already in
the system holding the left rule of every context sentence on the paper
surface; this is the one other place a field of that colour is allowed. No
vermilion — the ink surface's accent stays on the ink surface.

Why this one: legibility at 16px does not depend on strokes resolving. A
solid field survives any size and the monochrome pinned-tab test, where a
mark built from lines does not.

Rejected, and why they are worth not re-proposing:

- **蟹 in mincho on ink** — the most on-thesis answer, and the one that dies
  at 16px. Nineteen strokes of hairline mincho is a smudge.
- **The lit hairline, name removed** — cannot degrade, because there is
  nothing to lose; also cannot be recognised as anything.
- **The crab as a creature** — the strongest alternative, and the one to
  revisit if findability in a crowded tab strip ever beats formality.
- **Dog-eared paper stock** — the only light-ground mark, but it argues for
  the lesson surface in a client that is mostly reviews.

Shipping it:

- **Trace 蟹 to paths.** An SVG that sets the glyph with a font stack renders
  differently on every machine and falls back to a random serif on most. The
  outline must come from an OFL-licensed mincho (Shippori Mincho, Noto Serif
  JP) with attribution — not from Hiragino, which is licensed to the machine
  and not redistributable in a public repo.
- **Three files in `public/`**: `favicon.svg`, a 32px PNG for browsers that
  ignore SVG, and a 180px `apple-touch-icon.png`. Vite copies `public/` to
  the root of `dist`.
- The link tags have to respect `base: '/kanigami/'` or they 404 on Pages
  like any other asset.

---

## Safety — testing against a real account

There is no staging WaniKani. Every phase is tested against somebody's real
SRS progress, so the write path is gated deliberately.

**API v2 has no destructive endpoints.** No deletes, no resets, no way to
touch the account itself. The entire write surface is four calls:
`POST /reviews`, `PUT /assignments/{id}/start`, and create/update on
`/study_materials`. The worst an incorrect client can do is submit a wrong
answer or start a lesson early — bad SRS data, not a wrecked account. There
is no undo for either, which is why the rules below are not optional.

1. **Phases 1–3 run on a read-only token.** WaniKani's token page has
   per-permission checkboxes (start assignments, create reviews, create and
   update study materials, update user preferences). Leave every one
   unchecked. WaniKani then rejects writes with a 403 server-side, whatever
   the client tries to do — a guarantee no amount of code review can match.
2. **Do not wire `submitReview` or `startAssignment` before Phase 4.** They
   exist in `src/lib/wanikani.js` and are deliberately imported by nothing.
   `grep -rn 'submitReview\|startAssignment' src/` should list only their own
   definitions until Phase 4 begins.
3. **Phase 4 ships behind a dry-run switch, default on.** In dry-run,
   grading and queueing run for real and the would-be request is logged
   instead of sent — `dry run: POST /reviews {assignment_id, meaning: 0,
   reading: 1}`. Run a full session in dry-run and read the log before any
   real submission.
4. **Take a baseline before the first live write.** `GET /assignments` is
   read-only; dump it to a file and keep it. If a bug misgrades a batch, that
   snapshot is the only record of what the stages were beforehand.
5. **First live write is one item.** Submit a single review, then open
   wanikani.com and confirm the stage and next-review time match what the
   response said. Only then let a whole session through.
6. **Rotate the token after Phase 4 testing.** Revoking on the settings page
   is instant and costs nothing.

---

## Phase 0 — scaffold ✅ done

Vite + React 19, Pages workflow, token gate, API client, ink surface tokens.
`src/lib/wanikani.js` covers user, summary, available reviews and lessons,
subjects, study materials, `POST /reviews`, and `PUT /assignments/{id}/start`.

---

## Phase 1 — session engine

**Files:** `src/lib/session.js`, `src/lib/session.test.js`

A pure state machine over the queue. No React, no fetching.

- `createSession(subjects, assignments)` → session state.
- Each item tracks `meaningDone`, `readingDone`, `incorrectMeaning`,
  `incorrectReading`.
- `nextQuestion(session)` picks the next unanswered question. Interleave
  meaning and reading rather than asking both for one subject back to back,
  and never ask the same subject twice in a row while other items remain.
- `answer(session, verdict)` advances or requeues. A wrong answer puts the
  item back with at least a few items in between.
- An item is **complete** when both its questions are correct; only then does
  it become eligible for submission.
- `sessionProgress(session)` → `{ remaining, completed, total }`.

**Acceptance:** vitest covers interleaving, requeue distance, wrong-answer
accumulation across retries, and a radical (meaning-only) completing after
one correct answer.

---

## Phase 2 — the grader

**Files:** `src/lib/grade.js`, `src/lib/grade.test.js`
**Dependency:** add `wanakana` — do not hand-roll romaji→kana.

This is the hard part of the whole app. A grader that is wrong by 5% feels
broken immediately, and it is the reason people distrust third-party clients.

`grade({ subject, questionType, input, synonyms })` returns
`{ verdict, hint }` where verdict is `'correct' | 'incorrect' | 'retry'`.

**Readings**

- Convert input with `toKana`, then compare against
  `subject.readings.filter(r => r.accepted_answer)` — exact match only, no
  fuzzy matching on kana.
- If the input matches a reading on the subject with `accepted_answer: false`
  (a kanji's other reading), return `'retry'` with hint *"WaniKani wants the
  on'yomi"* — the field shakes it off, the answer does not count as wrong.
  This one behaviour accounts for most of the perceived unfairness in naive
  clients.
- Vocabulary readings must match exactly; there is no partial credit.

**Meanings**

- Accept `subject.meanings.filter(m => m.accepted_answer)`, plus
  `subject.auxiliary_meanings` where `type === 'whitelist'`, plus the user's
  synonyms from `/study_materials`.
- Reject outright any `auxiliary_meanings` with `type === 'blacklist'`, even
  if it is within typo distance of an accepted meaning.
- Typo tolerance is Levenshtein distance scaled by answer length: 0 for
  answers of 3 characters or fewer, 1 for 4–5, 2 for 6–7, and 2 + one per
  additional 7 characters beyond that.
- Normalise before comparing: lowercase, trim, collapse inner whitespace,
  strip a leading `to ` on verbs and a leading article.
- If the user typed kana into a meaning question, return `'retry'` with
  *"We want the meaning, not the reading"*.

**Acceptance:** a table-driven test file with at least 40 cases including
`さん`/`やま` for 山, blacklist rejection, each typo-tolerance band, a user
synonym, and kana-in-a-meaning-box.

---

## Phase 3 — the ink review screen

**Files:** `src/components/Review.jsx`, `src/components/Glyph.jsx`,
`src/components/AnswerField.jsx`

Wire Phases 1 and 2 to the ink surface described above. Radical subjects
without a Unicode codepoint must render `character_images` (prefer the SVG),
inverted for the dark ground.

Keyboard-first: Enter submits, Enter again advances, and focus never leaves
the field. Respect `prefers-reduced-motion` on the rule-lighting transition.

**Acceptance:** a full session of ten items can be completed with the
keyboard alone, and every state — asking, correct, incorrect, retry-nudge —
is reachable in the browser.

---

## Phase 4 — submission

**Files:** `src/lib/submit.js`, wired into `Review.jsx`

Read **Safety** above before starting this phase — it is the one that can
damage real progress, and it ships behind a default-on dry-run switch.

- On item completion, `POST /reviews` with the accumulated counts.
- Submit as items complete, not in one batch at the end — a closed tab must
  not lose finished work.
- Show the returned SRS movement from the response payload.
- On failure, retry with backoff and keep the item in a pending list; surface
  *"3 answers still syncing"* rather than failing silently.

**Acceptance:** a completed item's stage change matches what wanikani.com
shows for the same item.

---

## Phase 5 — the paper lesson surface

**Files:** `src/components/Lesson.jsx`, `src/lib/mnemonic.js`

The book spread described above. `mnemonic.js` parses WaniKani's mnemonic
tags into a safe span tree — that parser gets its own tests.

Flow: batch of five lessons → read each → a quiz over the batch that reuses
the Phase 2 grader → `PUT /assignments/{id}/start` for each item that
passes. Context sentences come from `context_sentences`; readings render as
`<ruby>`.

**Acceptance:** started lessons appear in the review queue on wanikani.com.

---

## Phase 6 — session wrap

**Files:** `src/components/Wrap.jsx`

End-of-session summary on the ink surface: count, accuracy, the items that
were missed, and what the queue looks like next. No confetti, no streak
mechanics, no scores out of five.

---

## Phase 7 — the edges

- Token revoked mid-session → return to the gate without losing pending
  submissions.
- Network loss → pause the session and say so plainly; do not drop answers.
- Free accounts past level 3 → explain rather than 401.
- Empty queue → the calm state, with the next review time.
- Full keyboard navigation and visible focus on every control.
- A wrap-up control that ends the session early and submits what is done.

---

## Reference

- API docs: <https://docs.api.wanikani.com/>
- Token settings: <https://www.wanikani.com/settings/personal_access_tokens>
- Subject fields worth knowing: `characters`, `character_images`, `meanings`,
  `auxiliary_meanings`, `readings` (each with `accepted_answer`, `primary`,
  `type`), `meaning_mnemonic`, `reading_mnemonic`, `context_sentences`,
  `component_subject_ids`, `level`.
- Known wrinkle to test rather than assume: writes to `/study_materials`
  have historically tripped CORS in browsers, unlike the read endpoints.
  Nothing in this plan needs those writes; if a later feature does, verify
  before designing around it.

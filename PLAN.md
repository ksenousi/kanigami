# kanigami — build plan

A handoff document. **Every phase is built and on `main`.**

One acceptance is outstanding, and it is not code. Phase 5's write path has
now been run live; **Phase 4's has not**, because it cannot be until
something is actually due for review — a freshly started item is hours away
from its first one. Everything else about Phase 4 is verified against a
stubbed transport, which proves the client sends what it means to and not
that WaniKani does what we expect with it. See the note at the end of it, and
**Safety** below for the procedure.

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

Two surfaces, one token system, already declared in `src/index.css`; extend
that file rather than starting a new one.

**The hex values below are the default theme, not the thing to type.**
`src/index.css` is layered palette → roles → surfaces, and a component asks
for a role — `--ground`, `--text`, `--text-strong`, `--text-soft`, `--dim`,
`--rule`, `--accent` — never for `--vermilion` or a literal `#c8452c`. Each
colour named here gives its role beside it for that reason. A rule that
reaches past the role layer is a rule no theme can move.

### 墨 Ink — the review surface

The character *is* the interface. Ground `#100e0c` (`--ground`), text
`#e6dfd0` (`--text`), one vermilion `#c8452c` (`--accent`) hairline carrying
every accent in the screen. Display type — the glyph and the standing figures
— sits slightly brighter at `#f2ece0` (`--text-strong`), and running prose
slightly back at `#cfc6b4` (`--text-soft`).

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
- **The two verdicts do not share a colour.** Decided from a prototype after
  the first build shipped them both in vermilion, which meant the accent
  fired on every answer and so carried no information at all.
  - Correct: the rule lights **青磁 celadon `#7fa693` (`--ok`)**, the accepted
    answer and the verdict line take it too, and the glyph's halo warms to it.
    The SRS movement stays one dim line of type (`apprentice IV → guru I`).
  - Wrong: the rule lights **vermilion (`--accent`)**, and the item returns to
    the queue. Still no shake, no red flood, no sound — the hue split is the
    whole signal, and it is pre-attentive, so a miss cannot slide past.
- Celadon is the traditional foil to vermilion, desaturated enough never to
  read as a success badge and far enough from the paper surface's indigo to
  keep the two apart. Rejected: **藍 indigo**, the widest hue separation, but
  it is now the paper stock and would be doing two unrelated jobs; **若草**, an
  olive too close to conventional green-means-right; **金茶 gold**, warm and
  companionable but vermilion's near neighbour and the easiest to confuse at a
  glance; **no hue at all**, cleanest by the one-accent rule and the weakest
  signal of the five.
- Also prototyped and rejected for the wrong state: striking through what you
  typed (見せ消ち), severing the rule, dimming the glyph, and thickening the
  hairline. The hue split alone was judged enough; **do not stack a second
  device on top of it.**
- Footer is one hairline track with `n left` at the right. Stats do not
  belong on this screen.

### 紙 Paper — the lesson surface

Lessons are reading material, so typeset them.

**The stock is 藍 indigo, a night stock.** Decided from a prototype; it
replaces the warm light stock this surface shipped with, because going from a
review to a lesson flashed you. Ground `#11141b` (`--ground`), rules `#252c3a`
(`--rule`), text `#dfe3ec` (`--text`), display type `#f0f3fa`
(`--text-strong`), running prose `#aeb5c4` (`--text-soft`), seal-red accent
lifted to `#d4593c` (`--accent`) to carry on a dark ground. Mincho throughout,
exactly as before — **the whole change is one block of palette values, and no
component rule moved.** That is what the palette → roles → surfaces layering
was built for; if a future stock needs a rule changed, the rule is reaching
past the role layer.

The two surfaces are still committed worlds, not a light/dark pair. Paper's
ground is a blue-black and ink's is a warm brown-black, which is what keeps
them apart now that both are dark. Rejected: a **warm night stock**, the same
paper under a lamp, which read as ink with different type; and **one world**,
dropping the paper palette entirely so lessons differ only in typography —
the simplest answer to the request, and it costs the thesis the app is built
on.

Radical stroke images invert on this surface now (`--paper-strokes:
invert(1)`), the same as on ink, because the ground is no longer light.

- Two columns, a book spread: **verso** holds the character large with its
  reading as `<ruby>`, and beneath it the context sentences against a
  seal-red left rule; **recto** holds the meaning as a display-size heading,
  the readings labelled on'yomi / kun'yomi, and the two mnemonics as real
  prose at ~42ch, each under a mono label. The subject-type line and level
  sit in the running head.
- **The sentences are on the verso deliberately.** They started on the recto,
  which then ran past the fold on any subject with two long mnemonics while
  the verso stopped a third of the way down — one page overflowing beside an
  empty one. Moving them balances the spread and removes the scroll without
  hiding or cutting anything. Rejected: splitting the reading mnemonic onto
  its own page (doubles the Nexts in a batch), and letting the recto scroll
  inside a viewport-capped spread — worth revisiting only if a mnemonic ever
  overflows even a balanced spread.
- This originally asked for a stroke count on the verso and furigana on the
  context sentences. The API carries neither; see Phase 5 for what they
  became.
- Mnemonics arrive from the API as `meaning_mnemonic` / `reading_mnemonic`
  containing tags like `<radical>`, `<kanji>`, `<vocabulary>`, `<reading>`,
  `<meaning>`, `<ja>`. Parse them into styled spans — do **not** dump them
  through `dangerouslySetInnerHTML`, and do not strip them to plain text
  either; the emphasis is load-bearing for memorisation.
- Running head and folio in mono at the top and bottom edges.
- On narrow screens the spread stacks: verso above, recto below.

Under 640px, both surfaces go single-column; the glyph sizes are already
fluid.

### 家 Home — the ink surface, standing led

Decided from a prototype. `Connected.jsx` is a placeholder that says so in its
own comment; this is what replaces it. Home is the only screen that answers
*which of the two worlds am I entering, and is it worth entering now*, and
since there is no router it is a state in `App.jsx`, not a route.

It is the ink surface. Masthead, then the middle carries **position**:

- Reviews due and lessons waiting as standing figures, reviews in `--accent`
  when there are any and `--dim` when there are none. Beneath them, kanji
  passed this level as a smaller figure.
- The SRS spread as **one segmented hairline** 2px tall, with the counts as
  one line of letter-spaced mono beneath. Never five cards with five numbers
  in them, which is the thing being replaced. Apprentice takes `--accent`;
  the other four are palette entries of their own — `--srs-guru #8a6f4a`,
  `--srs-master #4f6b78`, `--srs-enlightened #5a5f7a`, `--srs-burned
  #8b8275` — themeable, unlike WaniKani's subject colours, because they are
  ours. A walk away from the accent as items get further from needing
  attention: hot, warm, cool, cooler, and finally the colour draining out.
- **Each count is set in its own band's colour.** Decided from a prototype
  after the first build left them all `--dim`: the segments are proportional
  and the words evenly spaced, so nothing tied a number to a colour and you
  had to count along the bar. Colour does the tying and the line stays
  centred.
  - This is why burned has a colour of its own. It was `--rule`, which
    measures **1.28:1** against the ink ground — unreadable as 9.5px type,
    and it made 45% of the bar look like empty track. 灰 ash `#8b8275` is
    5.09:1, warm enough to separate by hue from enlightened next to it, and
    still the quietest of the five.
  - The other four measure 3.0–4.1:1, which is marginal at this size. So is
    `--dim`, which is what they replaced, so nothing got worse — but a theme
    picking new SRS colours should check them as **text**, not just as bars.
  - Rejected: aligning each count under its own segment (works, but colour
    is simpler and keeps the line centred), a swatch dot per word, and
    dropping burned from the bar entirely.
- **Everything learned so far, by kind**, as one line above the spread —
  `224 radicals · 525 kanji · 1646 vocabulary`, each in WaniKani's subject
  colour. It needs no extra request: the started-assignments collection the
  spread already fetches carries `subject_type`. Vocabulary's `#aa00ff` is
  3.81:1 and stays as it is; those three colours are WaniKani's and mean the
  same thing whatever the theme.
- Two ways in, as the house pattern: type over a hairline that lights
  `--accent` on hover and focus. `Review` and `Learn`, each with its
  keystroke in mono underneath. Disabled is 35% opacity with the rule staying
  dim.

**The footline track is the forecast.** Every screen already draws a 1px rule
across the bottom; on home it carries the next 24 hours from `/summary`'s
hourly buckets — segments rising from the baseline, the next few hours at
`color-mix(in srgb, var(--accent) 55%, var(--ground))` so they stay on the
theme's accent rather than a hardcoded brown, and empty hours staying 1px.
There are **no gaps between the hours**: a gutter turns the rule this is
supposed to be into a row of ticks.

**The backlog is not part of the forecast.** Decided from a prototype.
WaniKani's first bucket holds everything already due, which on a neglected
account is larger than the rest of the day put together — 364 against a
next-tallest of 31 — so letting it set the scale flattened the twenty-three
hours the rule exists to show, and spent the whole width repeating the number
already standing above it. It is drawn as a **3px full-height tick in
`--accent`** at the left, a marker rather than a quantity, and the hours after
it are scaled among themselves. `364 due` sits at the left and `+24h` at the
right; with nothing due the left reads `next at 18:00`, or `nothing in 24h`.

Rejected: **time leading**, with the forecast as a full chart mid-screen and
the SRS spread demoted to a rule — clearer at a glance, but it makes the
screen mostly about a chart. **Peers**, one hairline row each — the safe
compromise, and it reads like one. Also rejected earlier: the bare door with
two counts, the paper table-of-contents, and cutting home entirely.

**The risk to check first.** A sparkline drawn at hairline weight in a footer
is either the most characteristic thing in the app or too quiet to read. Look
at it at 1× on a laptop before building anything else on top of it. If it
does not read, the fallback is to raise the track to 2px and keep everything
else — not to promote the forecast back into the middle of the screen, which
is the direction that was rejected.

### The mark — 落款 the seal

Decided from a prototype of five directions. The app ships **no favicon at
all** today, which is the gap this closes.

The mark is a seal stamp: a full-bleed square filled seal red `#9e3b26`, with
蟹 reversed out in paper `#f3ede0`. Seal red is already in the system holding
the left rule of every context sentence on the paper surface; this is the one
other place a field of that colour is allowed. No vermilion — the ink
surface's accent stays on the ink surface.

**The corner is soft in some files and square in others**, and the split is
not cosmetic — copying one setting across all four brings a bug back.

- `favicon.svg` and `favicon-32.png` are rounded, 6 of the 64-unit box. Their
  transparent corners composite correctly against any tab.
- `favicon.ico` is square and carries **no alpha channel at all**. Safari
  flattens transparency onto white, so a rounded `.ico` draws a white halo
  around the seal on a dark tab. That halo was reported and chased twice; the
  corner radius was never the cause. The missing `.ico` was — Safari requests
  one whatever the link tags say, and 404 sent it back to guessing.
- `apple-touch-icon.png` is square because iOS applies its own corner mask.
  Pre-rounding double-rounds it on the home screen.

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

Shipped, and why it is built the way it is:

- **The glyph is traced to outlines, not set in a font.** An SVG that names a
  font stack renders differently on every machine and falls back to a random
  serif on most of them. `public/favicon.svg` carries the outline as one
  path, taken from **Shippori Mincho SemiBold** (SIL Open Font License 1.1,
  attributed in a comment inside the file). Not from Hiragino, which is
  licensed to the machine and cannot be redistributed from a public repo.
- **SemiBold, not Regular.** Reversed-out type reads lighter than positive
  type at the same weight, and Regular's hairlines stop resolving around
  32px. Bold was tried and rejected — its counters close up at 180.
- The character's ink fills 40 of the 64-unit box, centred on its own bounding
  box rather than its advance width, so it sits optically centred in the seal.
- **Three files in `public/`**: `favicon.svg`, `favicon-32.png` for browsers
  that ignore SVG, and a 180px `apple-touch-icon.png`. Vite copies `public/`
  to the root of `dist` and rewrites the `href`s in `index.html` to
  `/kanigami/…`, so `base` is already handled — verify it stays that way if
  the link tags are ever edited.
- To regenerate at another size or weight, re-trace from the OFL font. Do not
  hand-edit the path data.

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

1. **Work on a read-only token unless the task is the write path itself.**
   Only two calls write — `POST /reviews` and `PUT /assignments/{id}/start` —
   and both sit behind the default-on dry run, so even they run read-only
   until somebody turns it off. Reading needs no permission at all, so a
   token with every box unchecked runs the whole app in dry run, and WaniKani
   rejects any write with a 403 server-side whatever the client tries — a
   guarantee no amount of code review can match.

   Exactly two boxes matter when you do want to write: **`reviews:create`**
   to submit reviews and **`assignments:start`** to start lessons.
   `study_materials:create`, `study_materials:update` and `user:update` are
   never used and should stay unchecked. The token gate says this on screen;
   keep the two in step if either ever changes.
2. **Both writes are wired, and both reach the network from `App.jsx` only.**
   It hands each to a `createSubmitter` as `send` — `submitReview` for a
   review session, `startAssignment` for a lesson batch. `grep -rn
   'submitReview\|startAssignment' src/` should show their definitions and
   those two call sites, and nothing else. No screen imports either; if one
   ever does, that is the regression to catch.
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

## Phase 1 — session engine ✅ done

**Files:** `src/lib/session.js`, `src/lib/session.test.js`

A pure state machine over the queue. No React, no fetching.

- `createSession(subjects, assignments)` → session state.
- Each item tracks `meaningDone`, `readingDone`, `incorrectMeaning`,
  `incorrectReading`.
- `nextQuestion(session)` picks the next unanswered question. Interleave
  meaning and reading rather than asking both for one subject back to back,
  and never ask the same subject twice in a row while other items remain.
- `answer(session, question, verdict)` advances or requeues. A wrong answer
  puts the item back with at least a few items in between. The question has
  to be handed back in: it is checked against what the session is actually
  asking and throws on a mismatch, so a component holding a stale question —
  a double Enter, a timer, a stale dependency array — cannot silently grade
  the wrong item.
- An item is **complete** when both its questions are correct; only then does
  it become eligible for submission. `answer` reports the item a correct
  answer just finished as `justCompleted`, which is the hook Phase 4 needs to
  submit as items complete rather than in one batch.
- `sessionProgress(session)` → `{ remaining, completed, total }`, counting
  items rather than questions.

**Shipped:** 26 vitest cases covering interleaving, requeue distance,
wrong-answer accumulation across retries, a radical (meaning-only) completing
after one correct answer, and the stale-question guard.

The queue order is deterministic and follows the order subjects are passed
in — which for `getSubjects` means ascending id, so radicals arrive before
kanji before vocabulary. If a session should feel shuffled, shuffle at the
caller; the engine deliberately has no randomness in it.

---

## Phase 2 — the grader ✅ done

**Files:** `src/lib/grade.js`, `src/lib/grade.test.js`
**Dependency:** `wanakana` — do not hand-roll romaji→kana.

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
- Same nudge when nothing matches as a meaning but the input converts to one
  of the subject's readings — `yama` for 山 is the same mistake as やま by
  someone whose keyboard was in the wrong mode, and counting it as a miss
  would send an undeserved wrong answer to WaniKani. Meanings are checked
  first, so a romaji synonym the user added themselves is still accepted as
  the meaning it is.

**Shipped:** 71 table-driven cases including `さん`/`やま` for 山, blacklist
rejection, every typo-tolerance band at both edges, a user synonym,
kana-in-a-meaning-box, and romaji-in-a-meaning-box.

Two behaviours worth knowing before changing anything here:

- Tolerance scales by the **accepted meaning's** length, not the input's, and
  the most forgiving candidate wins. `fountain` therefore passes for 山. This
  is WaniKani's own model; their `auxiliary_meanings` blacklist is the
  intended fix for a specific near-miss, not a tighter distance function.
- The reading nudge names the on'yomi or the kun'yomi only when every
  accepted reading agrees on a type. Anything else — including vocabulary,
  whose readings carry no type — falls through to *"WaniKani wants a
  different reading"*.

---

## Phase 3 — the ink review screen ✅ done

**Files:** `src/components/Review.jsx`, `src/components/Glyph.jsx`,
`src/components/AnswerField.jsx`, `src/lib/subject.js`, `src/lib/queue.js`

Phases 1 and 2 wired to the ink surface. Radical subjects without a Unicode
codepoint render `character_images` (the SVG where there is one), inverted for
the dark ground.

Keyboard-first: Enter submits, Enter again advances, and focus never leaves
the field. The grader's third verdict is a UI state and not an error —
`'retry'` lights nothing, counts nothing, and leaves the typed answer to be
corrected.

**Shipped:** 19 further vitest cases on `subject.js`, and a full ten-item
session driven end to end in the browser: asking, correct, incorrect, both
retry nudges, and the finished state.

Four things here were decided against the obvious alternative, and the
alternative is worth not re-proposing:

- **Enter is handled on `keydown`, not by the form's implicit submission.**
  Implicit submission depends on conditions this field cannot promise, and it
  was observed not firing. The `keydown` handler cancels the default, so the
  two paths cannot both fire — remove that `preventDefault` and every answer
  submits twice.
- **The rule does not light on focus here**, which is what `.field.review` in
  the stylesheet arranges. Focus is in the field from the first question to
  the last, so a rule that lit on focus would never once be dark and would
  carry no information at all. Lit means judged. Correct and incorrect light
  the same rule; the line of type beneath is what differs.
- **The verdict is derived from the question the screen is showing**, held in
  state, because by then `session` is already the next generation.
  `answer()` is called once, on the first Enter, with that same question
  handed back to it; the second Enter never reaches the grader.
- **`src/lib/subject.js` holds the awkward cases** — a radical with no
  codepoint, readings that disagree about their type — because they are
  data-shaped, and a component cannot be tested as cheaply as a function.
  `src/lib/queue.js` is the one impure piece: three reads and a
  `createSession` over them.

`--strokes` joined the palette layer for the radical images: WaniKani ships
them black on transparent, so the ink surface inverts them and paper does not.
A theme sets `--ink-strokes` / `--paper-strokes` like any other palette value.

The session's finished screen is deliberately the honest minimum — it says the
session is over and that nothing was submitted. Phase 7 replaces it.

---

## Phase 4 — submission ✅ built, ⚠️ not yet proven against a real account

**Files:** `src/lib/submit.js`, `src/lib/srs.js`, wired through `App.jsx` and
`Review.jsx`

Read **Safety** above before touching this phase — it is the one that can
damage real progress.

`createSubmitter({ send, dryRun })` takes completed items and settles them one
at a time. `Review.jsx` hands it `justCompleted` and subscribes with `watch`;
it never sees the token or the API. `srs.js` names the stage numbers the
response comes back with, and names nothing it was not given.

**Shipped:** 23 further vitest cases, and all three paths driven end to end in
the browser against a stubbed transport — dry run, a successful submission,
and a refusal.

- **Dry run is the default in the constructor**, not in the caller. A
  submitter built by code that forgot to think about this writes nothing, and
  the switch is off again after every reload: turning it off is a decision to
  write to a real account, and that decision should not survive a refresh.
  The log line is the one the plan specified —
  `dry run: POST /reviews {assignment_id: 1001, meaning: 0, reading: 0}`.
- **The screen says which mode it is in for the whole session.** The footline
  reads `dry run` in `--dim`, or `submitting` in `--accent` — the live-write
  session is the one that gets the accent, because it is the one worth
  noticing.
- **Items go one at a time, in the order they finished.** It stays well clear
  of the rate limit, and a queue that fans out has no order left to report.
- **Retries are for failures that retrying can fix.** 400, 401, 403, 404 and
  422 give up at once — a rejected token is still rejected in a minute, and
  waiting is a way of not saying so. Everything else backs off 1s, 4s, 15s,
  60s and then lands in `failed`, where the footline counts it as syncing and
  the finished screen names it.
- **The movement line arrives a beat after the answer**, because the request
  does. It reads `submitting` until the response lands and only ever shows
  what came back.

**Still to do, and it is the acceptance:** run a real session against a real
account. Safety steps 4 to 6 are the procedure — take the `GET /assignments`
baseline first, let exactly one item through, check the stage and next-review
time on wanikani.com against what the response said, and rotate the token
afterwards. Nothing in this repo has yet written to a real account.

---

## Phase 5 — the paper lesson surface ✅ done

**Files:** `src/components/Lesson.jsx`, `src/components/Mnemonic.jsx`,
`src/lib/mnemonic.js`

The book spread described above. A batch of five is read, then quizzed, and
each item that passes gets `PUT /assignments/{id}/start`.

**Shipped:** 15 vitest cases on the parser, and the spread driven in the
browser — kanji, a radical with no codepoint, and vocabulary, at both widths.

- **`mnemonic.js` parses to a flat list of `{ text, tag }`, and that is the
  whole XSS defence.** Every piece leaves as a text node, so there is no code
  path in `Mnemonic.jsx` that could emit HTML even if the input asked for it.
  A tag WaniKani does not use — `<script>`, `<img onerror=…>` — is text, and
  there is a test for each. Do not replace this with a sanitiser and
  `dangerouslySetInnerHTML`: the point is not that the markup is cleaned, it
  is that no markup is ever produced.
- **The quiz runs on the ink surface**, reusing `Review.jsx` whole. Paper is
  for reading material; a quiz is a quiz. The only difference is the
  submitter it is handed, and the screen cannot tell.
- **One submitter abstraction covers both writes.** `createSubmitter` takes a
  `describe` for its dry-run line, so a lesson logs
  `dry run: PUT /assignments/1001/start` rather than a review it is not
  making. `movement()` gained the started-lesson case: an assignment carries
  one stage and no movement, because there was nowhere for it to move from.

Two things the design asked for that the API does not carry, and what they
became instead — worth knowing before "fixing" them:

- **Stroke count.** Not a field on any subject. The verso shows the character
  count, which is the honest equivalent of what is actually there.
- **Furigana on context sentences.** `context_sentences` are plain `ja` and
  `en` strings with no per-kanji readings, so there is nothing to align ruby
  to. The sentence is set against the seal-red rule with its translation
  under it. Ruby survives on the verso, where the reading belongs to the
  whole word and alignment is not in question.

**Acceptance met.** A batch was run live against a throwaway account: dry run
first to read the log, then the writes. Every start returned the started
stage and a scheduled review, and the home surface picked both up on the way
back — the spread moved and the forecast grew a bar at the hour they come
due.

---

## Phase 6 — the home surface ✅ done

**Files:** `src/components/Home.jsx`, `src/components/Forecast.jsx`,
`src/lib/standing.js`

Built to the 家 Home spec above. `Connected.jsx` is gone.

**Shipped:** 18 vitest cases on `standing.js`, and all five states driven in
the browser — reviews due, nothing due, lessons only, loading, token revoked.

- **The risk the spec flagged is settled: the footline forecast reads at 1×.**
  The current hour in `--accent` carries it, the next four sit at
  `color-mix(… 55% …)`, and an empty hour is 1px — the baseline itself, not a
  gap in it. The 2px fallback was not needed.
- **Three reads, once, on mount and never on a timer.** `/summary` carries
  both counts *and* the forecast, which is cheaper than the two
  immediately-available collections it replaces. `/assignments?started=true`
  is the paginated one, for the spread. `/assignments?levels=N&
  subject_types=kanji` is a server-side filter, which is what makes the
  passed-this-level figure cheap rather than a scan.
- **A count of nothing is `--dim`.** Only reviews take `--accent`, and only
  when there is something to act on.
- `r` and `l` open the two doors, and only when a door is open.

`standing.js` reads stages, it never decides them — the same rule as `srs.js`,
for the same reason.

---

## Phase 7 — session wrap ✅ done

**Files:** `src/components/Wrap.jsx`, `sessionReport` in `src/lib/session.js`

End-of-session summary on the ink surface: count, accuracy, the items that
were missed, and what the queue looks like next. No confetti, no streak
mechanics, no scores out of five — the missed items are the useful part of a
session and they get the room.

**Shipped:** 6 further vitest cases on `sessionReport`, and the review →
wrap handoff driven in the browser.

- **Every session ends here, and only here.** `Review.jsx` no longer has a
  finished state of its own; it calls `onExit(session)` both when it runs out
  of questions and when the wrap-up control is used, so the two paths cannot
  disagree. That control is also Phase 8's early-exit: everything finished is
  already submitted, so stopping loses nothing.
- **Accuracy is counted over questions, not items** — a kanji whose reading
  you missed twice and then got right is one item and three answers. It holds
  for a session ended early, and it is null rather than 100% when nothing was
  asked.
- **The summary is fetched here rather than handed down**, because the
  session just changed it. The end of a session is the only moment the
  forecast is certainly fresh.

---

## Phase 8 — the edges ✅ done

**Files:** `src/components/useOnline.js`, and edits across the screens.

- **Token revoked mid-session** → the submitter records the failure with its
  HTTP status, and the wrap offers the gate. It is offered rather than taken:
  leaving that screen automatically would carry off the only record of what
  did not get sent.
- **Network loss** → the session pauses and says so. The field goes
  read-only, answers are refused rather than swallowed, and what was already
  typed survives the pause. `navigator.onLine` is a coarse signal — it knows
  there is an interface, not that WaniKani is reachable — so it is used only
  to say so, never to decide that an answer failed. That stays with the
  submitter, which retries.
- **Free accounts past level 3** → 403 is translated in `wanikani.js`, where
  every other status is, rather than at each call site.
- **Empty queue** → home's nothing-due state from Phase 6. There is still
  only one of them.
- **Keyboard and focus** → `r` and `l` open the two doors, arrows walk a
  lesson spread, Enter answers and advances, and `:focus-visible` rings every
  control on both surfaces.
- **Early exit** → the wrap-up control, built in Phase 7. Everything finished
  is already submitted, so it loses nothing.

The whole app was driven end to end against a stubbed API for this: gate →
home → review → wrap, and home → lesson spread → quiz → wrap, keyboard only,
in dry run and out of it.

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

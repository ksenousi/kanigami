# CLAUDE.md

kanigami (蟹紙) — a third-party WaniKani dashboard. Static, online-only,
read-only, running entirely in the browser on GitHub Pages.

**Read [PLAN.md](PLAN.md) before doing anything.** It holds the design spec
and the history of every decision. **The app is one screen, the 盤 board
(`Dashboard.jsx`), and it only reads.** It began as a full client with
review and lesson screens; those were removed when the owner found they
used the dashboard far more than the practice. They are in git history —
the last commit holding them is `03a7aa7` — and PLAN.md describes them.

## Architecture

- **Frontend** — React 19 + Vite SPA, no framework beyond that, no router.
  Entry `src/main.jsx`, root `src/App.jsx`, which renders the token gate and
  then `Dashboard.jsx`. Nothing else is reachable.
- **No backend.** WaniKani enables CORS, so the browser calls
  `api.wanikani.com` directly. There is no server, no database, and nowhere
  to put a secret.
- **Auth** — the user's own WaniKani personal access token in `localStorage`
  (`src/lib/token.js`). It is sent to nobody but WaniKani, and it needs no
  permissions: the gate asks for a read-only token.
- **API client** — `src/lib/wanikani.js`. All requests go through it; it
  throttles to WaniKani's 60/minute limit and follows pagination.
- **Deploy** — push to `main` runs `.github/workflows/deploy.yml`, building
  to `dist` and publishing to Pages. `vite.config.js` sets
  `base: '/kanigami/'` to match the Pages URL.

## Commands

| What | Command |
|---|---|
| Dev server (:5173) | `npm run dev` |
| Same, against a fake WaniKani — no token | `npm run dev:fake`, then `?fake=fresh` / `slow` / `offline` / `revoked` / `radicals-fail` / `vocab-fail` |
| Build | `npm run build` |
| Tests | `npm test` (only `src`; worktree copies are left out by `vite.config.js`) |
| Lint | `npm run lint` |

## Gotchas

- **Read stages, never decide them.** Every stage, next-review time, and
  passed or burned date on the board is WaniKani's, read off an assignment.
  The one forward look — the earliest level-up under the level's kanji — runs
  WaniKani's own interval table from `/spaced_repetition_systems`, never a
  copy in this code, and the screen says it assumes every answer is right.
  Keep projections labelled as projections, and keep them out of anything
  that reads as WaniKani's record.
- **Never bulk-sync the subject database — with two sanctioned exceptions.**
  Fetch only the subjects on screen — the level's kanji (and its radicals or vocabulary when switched to), the ten slipping
  items, and when their lens opens, the look-alikes and the field's sixty. A full sync is the offline feature this app deliberately does not
  have. The exception, on the owner's say-so: coverage reads every kanji
  subject (`getAllKanjiSubjects`, ~2,100, ~4 MB) at most once a week and
  keeps only id, level and character (`kanjiIndex`). The second, for
  taught's through-level slider: every radical and vocabulary subject
  (`getAllRadicalAndVocabularySubjects`, ~7,200, ~30–40 MB) at most once a
  week, kept as id, level and type only (`aheadIndex`). Those two are all;
  don't add a third, or keep more than those fields.
- **Nothing writes.** `wanikani.js` makes GETs only and the token gate asks
  for a token with no permissions, so WaniKani itself refuses any write.
  Adding a write call is a decision about what this app is, not a feature;
  if it ever happens, recover Safety from PLAN.md first.
- **`base` and the repo name are coupled.** Renaming the repo without
  changing `vite.config.js` 404s every asset on Pages.
- **A level's kanji assignments are not a level's kanji.** An assignment is
  created only once its subject is unlocked, so
  `/assignments?levels=N&subject_types=kanji` returns what you have reached
  and grows all through the level. It is the numerator of the board's
  kanji-to-level figure and never the denominator — WaniKani levels you up
  at 90% of the level's kanji passed, and the level's kanji come from
  `getLevelKanjiSubjects`, which reads them off `/subjects`. Counting
  the denominator out of the assignments says `4 kanji to level 11` on a
  level holding thirty-two.
- **An `/assignments` read that does not say `hidden=false` counts retired
  subjects.** WaniKani hides subjects it retires; their assignments stay in
  every collection while WaniKani's own lessons, reviews, and counts drop
  them. Every assignment read in `wanikani.js` carries `hidden=false` — the
  level-kanji read without it let the numerator count a retired kanji that
  the `hidden=false` denominator refuses, which can call a level-up early.
- **WaniKani's dashboard lesson number is not the lesson count — do not
  "fix" the board to match it.** The pink card shows Today's Lessons: the
  "maximum recommended daily lessons" app setting less the lessons already
  started that day. It is a countdown, and the setting behind it is the one
  input `preferences` does not carry. The real queue is what `/summary`'s
  lesson bucket and `/assignments?immediately_available_for_lessons` both
  report, and the board shows it on purpose — a report of the card's number
  being "right" and ours being "wrong" is the card being misread. This
  was settled deliberately: a mirrored daily pace was built, verified
  against a live dashboard to the lesson, and then removed, because the
  owner wants the true count and the mirror needed a hand-copied setting
  the API refuses to share. The record is in PLAN.md.
- **Radicals may have no Unicode character.** Fall back to
  `character_images` (prefer SVG) and invert for the ink ground.

## This repo is public

Everything committed here is world-readable at
`github.com/ksenousi/kanigami`, including anything a force-push later
removes. Assume every commit is permanent and public.

- **Never commit a real API token.** Not in a test, a fixture, a comment, a
  commit message, or a screenshot. The placeholder in the token field is
  all-zeros and the test UUIDs are obviously fake — keep it that way. A real
  token in a public repo exposes somebody's account — and a token with write
  scopes, their SRS progress — and must be revoked on the WaniKani settings
  page immediately if one lands.
- **Do not commit real API responses as fixtures.** Dumping a live
  `/subjects` or `/assignments` payload into a test file is the easy mistake
  here, and it commits two things at once: Tofugu's copyrighted mnemonics,
  and the account's own progress data. Hand-author the smallest object each
  test needs, with the fields the code actually reads.
- **No account data anywhere.** Username, level, review history, and
  timestamps stay out of tests, docs, and issue text.
- **Never log a token.** Not to the console, not into an error message, not
  as a URL or query parameter — request auth goes in the `Authorization`
  header and nowhere else.
- **The app holds the token in `localStorage` on a public origin**, so any
  script running there can read it. That is why every runtime dependency has
  to earn its place, and why nothing WaniKani sends is ever rendered as
  markup — no `dangerouslySetInnerHTML`, anywhere.
- **Commits use the GitHub noreply address**, already set in this repo's
  local git config. Don't override it with a personal email.
- `.claude/settings.local.json` and `.claude/worktrees` are gitignored;
  leave them that way.

## Conventions

- Plain JavaScript, no TypeScript. ES modules everywhere.
- No semicolons, single quotes, 2-space indent — match the surrounding file.
- Components in `src/components/`, pure logic in `src/lib/`. Keep `src/lib/`
  free of React so the counting stays cheap to test.
- Lint is oxlint; keep it clean on changed files.
- One surface, 墨 ink, tokens in `src/index.css`. De-boxed — no borders or
  cards that only group things. A hairline that lights is the house pattern,
  not an outlined box.
- **Every screen is a target: desktop, iPad, and phone.** The iPad counts
  either way up (820–1366px) and by touch alone, with no mouse: anything a
  mouse reads by hover has to read by tap too (`usePointing`), and `:hover`
  styles sit under `@media (hover: hover)` so a tap doesn't leave them lit.
  Below 1,280px the board drops to the tablet layout; below 700px to the
  phone's single column, where the whole type scale steps down together and
  the 24-hour strip scrolls sideways. A phone was once ruled out; the owner
  reversed that — check new work at 375px as well as 820 and 1440.
- **Capitals name things; everything else is read** (二 Two voices, in
  PLAN.md). Mono capitals are for section heads and figure labels only.
  Sentences are sentence-case sans, written that way in the JSX; counts are
  lowercase mono. Don't add a new line of tracked capitals.
- **Type sizes come from the scale, never from a number.** `--label`,
  `--small`, `--body`, `--input`, `--control` in `src/index.css`. `--label` is
  the floor and nothing goes under it — the mono labels sat at 9.5–10px with
  0.2em of tracking and were reported as hard to read. Raise the whole scale
  rather than one rule, or the hierarchy flattens.
- **`src/index.css` is layered palette → roles → surfaces.** Components read
  role tokens (`--ground`, `--text`, `--text-strong`, `--text-soft`, `--dim`,
  `--rule`, `--accent`) and never the palette underneath. Reaching past the
  role layer for `--vermilion` or `--ink-text` writes a rule that no theme
  can move, and adding a theme selector further down the file is the symptom,
  not the fix. A new theme is one `[data-theme]` block of palette values.
- WaniKani's subject colours (radical `#00aaff`, kanji `#ff00aa`, vocabulary
  `#aa00ff`) are information. They belong on one line of type, never as a
  full-bleed background.

# CLAUDE.md

kanigami (蟹紙) — a third-party WaniKani client. Static, online-only, running
entirely in the browser on GitHub Pages.

**Read [PLAN.md](PLAN.md) before doing anything.** It holds the phased build
plan, the design spec for both surfaces, and the safety procedure for testing
against a real WaniKani account. Every phase is built, and both write paths
are now accepted live against a throwaway account: `startAssignment` in
Phase 5, `submitReview` in Phase 4. Anything that touches either still needs
a real account and the Safety procedure to re-accept.

## Architecture

- **Frontend** — React 19 + Vite SPA, no framework beyond that, no router.
  Entry `src/main.jsx`, root `src/App.jsx`.
- **No backend.** WaniKani enables CORS, so the browser calls
  `api.wanikani.com` directly. There is no server, no database, and nowhere
  to put a secret.
- **Auth** — the user's own WaniKani personal access token in `localStorage`
  (`src/lib/token.js`). It is sent to nobody but WaniKani.
- **API client** — `src/lib/wanikani.js`. All requests go through it; it
  throttles to WaniKani's 60/minute limit and follows pagination.
- **Deploy** — push to `main` runs `.github/workflows/deploy.yml`, building
  to `dist` and publishing to Pages. `vite.config.js` sets
  `base: '/kanigami/'` to match the Pages URL.

## Commands

| What | Command |
|---|---|
| Dev server (:5173) | `npm run dev` |
| Build | `npm run build` |
| Tests | `npm test` |
| Lint | `npm run lint` |

## Gotchas

- **Never compute SRS stages.** `POST /reviews` reports wrong-answer counts;
  WaniKani decides the stage and the next review time and returns them. Read
  them from the response.
- **Never bulk-sync the subject database.** Fetch only the subjects the
  current session needs. A full sync is the offline feature this app
  deliberately does not have.
- **The write path is gated.** `submitReview` reaches the network from one
  place only — `App.jsx`, handed to `createSubmitter` as `send` — and a
  submitter is in dry run unless its caller says otherwise. `startAssignment`
  is gated the same way and reaches the network only from `App.jsx`. See
  Safety in PLAN.md; there is no undo for either.
- **Dry run is development-only and does not ship.** `App.jsx` seeds it from
  `import.meta.env.DEV`, and the switch in `Home.jsx` is gated on the same
  literal so the block folds away at build time. A built app opens writing —
  which is the point, since a deployed client that discards your answers is
  broken, not careful. `createSubmitter`'s own default stays dry run: that is
  the safety, and `App.jsx` is the single caller allowed to override it.
  **Running `npm run dev` is what protects a real account, not the UI.**
- **`base` and the repo name are coupled.** Renaming the repo without
  changing `vite.config.js` 404s every asset on Pages.
- **Radicals may have no Unicode character.** Fall back to
  `character_images` (prefer SVG) and invert for the ink ground.
- **The Japanese faces are a feature, not styling.** `src/lib/faces.js` holds
  four families; the review rotates one per question and the lesson shows all
  four together. A kanji met in one face teaches that picture rather than the
  character. **Never test whether a webfont arrived with
  `document.fonts.check`** — it answers "could this text be rendered with
  this list", the list ends in a fallback, and it returns `true` for a font
  that does not exist. Getting this wrong reports four faces while drawing
  one. Use what `document.fonts.load()` *resolves to* — a non-empty array of
  matched faces — which is what `useFaces.js` does. **Do not go back to
  matching `FontFace.family` against the family name.** That was the previous
  fix and it never worked in Safari: WebKit returns `family` CSS-serialized,
  so it is `"Noto Sans JP"` with the quotes in the string where Chrome
  returns a bare `Noto Sans JP`. Measured in Safari 26 — 494 faces in
  `document.fonts`, none equal to any name in `FACES`, so `available()` fell
  to its one-face floor and told a user with four working fonts that one had
  arrived. Anything comparing family names has to survive both spellings;
  the resolved faces sidestep it. **And probe more than once** — a screen can mount before the font
  stylesheet is parsed, and until then `document.fonts` holds none of these
  families, so `load()` matches nothing and resolves *successfully*. A single
  probe reads that as four missing fonts, for good. It has to keep asking,
  and stay quiet until it gives up: saying "blocked" at somebody whose fonts
  are merely slow is the false alarm that teaches them to ignore the real
  one.
- **A review face belongs to its question — pick it once and hold it.**
  `Review.jsx` keeps the rotation count and the chosen face in one piece of
  state and turns both over when a new question goes up, never at render and
  never on answering. Incrementing the count in `submit` restyled the
  character still on screen under its verdict, and recomputing `faceFor` each
  render let the list from `useFaces` re-index the rotation mid-question when
  a webfont turned out to be blocked. Both read to the user as flickering.

## This repo is public

Everything committed here is world-readable at
`github.com/ksenousi/kanigami`, including anything a force-push later
removes. Assume every commit is permanent and public.

- **Never commit a real API token.** Not in a test, a fixture, a comment, a
  commit message, or a screenshot. The placeholder in the token field is
  all-zeros and the test UUIDs are obviously fake — keep it that way. A real
  token in a public repo grants write access to somebody's SRS progress and
  must be revoked on the WaniKani settings page immediately if one lands.
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
  to earn its place, and why the Phase 5 mnemonic parser must not use
  `dangerouslySetInnerHTML` — WaniKani's mnemonics arrive as markup and that
  parser is the one real XSS surface in the app.
- **Commits use the GitHub noreply address**, already set in this repo's
  local git config. Don't override it with a personal email.
- `.claude/settings.local.json` and `.claude/worktrees` are gitignored;
  leave them that way.

## Conventions

- Plain JavaScript, no TypeScript. ES modules everywhere.
- No semicolons, single quotes, 2-space indent — match the surrounding file.
- Components in `src/components/`, pure logic in `src/lib/`. Keep `src/lib/`
  free of React so the session engine and grader stay cheap to test.
- Lint is oxlint; keep it clean on changed files.
- Two surfaces, tokens in `src/index.css`: 墨 ink for reviews, 紙 paper for
  lessons. De-boxed — no borders or cards that only group things. A hairline
  that lights is the house pattern, not an outlined box.
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

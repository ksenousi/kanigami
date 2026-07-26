# CLAUDE.md

kanigami (蟹紙) — a third-party WaniKani client. Static, online-only, running
entirely in the browser on GitHub Pages.

**Read [PLAN.md](PLAN.md) before doing anything.** It holds the phased build
plan, the design spec for both surfaces, and the safety procedure for testing
against a real WaniKani account. Phase 0 is done; start at the lowest
unfinished phase and ship one phase per branch.

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
- **The write path is gated.** `submitReview` and `startAssignment` must stay
  uncalled until Phase 4, and Phase 4 ships behind a default-on dry run. See
  Safety in PLAN.md — there is no undo for a submitted review.
- **`base` and the repo name are coupled.** Renaming the repo without
  changing `vite.config.js` 404s every asset on Pages.
- **Radicals may have no Unicode character.** Fall back to
  `character_images` (prefer SVG) and invert for the ink ground.

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
- WaniKani's subject colours (radical `#00aaff`, kanji `#ff00aa`, vocabulary
  `#aa00ff`) are information. They belong on one line of type, never as a
  full-bleed background.

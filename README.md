# kanigami 蟹紙

A quiet, read-only WaniKani dashboard. One screen, 盤 the board, on a dark
墨 ink ground — for a desktop browser or an iPad.

**Live at [ksenousi.github.io/kanigami](https://ksenousi.github.io/kanigami/).**

Static, online-only, and entirely browser-side: WaniKani enables CORS, so
the page talks to `api.wanikani.com` directly with your own personal access
token. There is no server and no database. The token is held in
`localStorage` on your device and is sent to nobody but WaniKani.

> Third-party and unofficial. Not built by the WaniKani team; WaniKani and
> its content belong to Tofugu.

## What the board shows

- **The figures** — reviews due, lessons waiting, kanji left to level up,
  reviews due within seven days, and meaning / reading accuracy.
- **The level** — every kanji of your current level, locked ones included,
  ordered by progress, with when each comes back for review. The level's
  radicals fold out beneath. A line projects the earliest level-up if every
  answer from here is right, and says so.
- **The SRS spread** and what moved in the past seven days.
- **Taught** — radicals, kanji and vocabulary started, each as a share of
  everything WaniKani has.
- **What keeps slipping** — the five items you miss most that are still in
  rotation.
- **Days per level**, with breaks left out of the scale, and a projection
  to level 60.
- **The road** — the sixty levels in WaniKani's six named decades.
- **The next 24 hours** of reviews, along the bottom.

Point at a kanji, a level bar, or an hour to read it — or tap it on an iPad.
The board reads once when it opens and again when you come back to a tab
that has gone stale; it never polls.

## It only reads

kanigami makes GET requests and nothing else — no reviews, no lessons, no
writes of any kind. Make the token with **no permissions checked**: one like
that reads everything the board shows, and WaniKani itself refuses any write
made with it.

It started as a full client with review and lesson screens; those were
removed once the dashboard turned out to be the part that got used. They are
in git history up to `03a7aa7`, and [PLAN.md](PLAN.md) describes them.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173/kanigami/ and paste a token from
[your WaniKani settings](https://www.wanikani.com/settings/personal_access_tokens).

| What | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Tests | `npm test` |
| Lint | `npm run lint` |

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), with
**Settings → Pages → Source: GitHub Actions**. `vite.config.js` sets
`base: '/kanigami/'` to match the Pages URL; rename the repo and that has to
change with it.

## Layout

```
src/App.jsx      the token gate, then the board — no router
src/components/  the board (Dashboard), the 24-hour footline, the token gate
src/lib/         pure logic, no React — the API client, counting, the SRS tables
src/index.css    the design tokens (palette → roles → surface) and the board's styles
PLAN.md          the design spec and the history of every decision
CLAUDE.md        conventions and gotchas for working on the code
```

## Licence

MIT — see [LICENSE](LICENSE). Applies to this client's code only.

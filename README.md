# kanigami 蟹紙

A quiet WaniKani client. **墨 ink for reviews, 紙 paper for lessons.**

Static, online-only, and entirely browser-side: WaniKani enables CORS, so
this talks to `api.wanikani.com` directly with your own personal access
token. There is no server and no database. The token is held in
`localStorage` on your device and is sent to nobody but WaniKani.

You bring your own WaniKani subscription — this renders your content to you,
and redistributes nothing.

> Third-party and unofficial. Not built by the WaniKani team; WaniKani and
> its content belong to Tofugu.

## Status

Everything in the plan is built — the home surface, reviews on the ink
surface, lessons typeset on paper, submission, the session wrap, and the
edges — and both write paths have been accepted against a real account.
Reviews submit; lessons start.

**The deployed app writes to your real SRS progress.** Each review goes to
WaniKani as you finish the item, and there is no undo for a submitted review.
Answering here is answering for real.

Dry run is a development gate and is not built into the deployed site. Under
`npm run dev` it is on by default and turns itself back on after every
reload: answers are graded and queued for real, and the request is logged to
the console instead of sent. See **Safety** in [PLAN.md](PLAN.md) before
turning it off against an account you care about.

## Running it

```bash
npm install
npm run dev
```

Then paste a token from
[your WaniKani settings](https://www.wanikani.com/settings/personal_access_tokens).
It wants two scopes — `reviews:create` and `assignments:start`. Reading takes
no permission at all, so on the dev server, where the dry run is on, a
read-only token walks the whole app without writing anything.

| What | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Tests | `npm test` |
| Lint | `npm run lint` |

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Two things
have to be true on the GitHub side first:

1. **Settings → Pages → Source: GitHub Actions.**
2. The repo is public, so Actions minutes are free.

`vite.config.js` sets `base: '/kanigami/'` to match the Pages URL. Rename the
repo and that has to change with it.

## Layout

```
src/lib/         pure logic — API client, token storage (session + grading land here)
src/components/  React surfaces
src/index.css    both surfaces' tokens: ink and paper
PLAN.md          the phased build plan
```

## Licence

MIT — see [LICENSE](LICENSE). Applies to this client's code only.

---
name: prototype
description: Prototype kanigami ideas as clickable claude.ai artifacts so Karim can pick a direction before anything is built. Use whenever Karim asks to prototype, mock up, redesign, or see options / directions / "what could X look like" for any screen, state, or interaction — and whenever a session hits a design question with several plausible answers (offer to prototype them). Covers grounding in the two surfaces, direction/state switchers, comparing against WaniKani itself, and the handoff into PLAN.md after Karim picks.
---

# kanigami prototyping — ideas as artifacts

Turn an idea into something Karim can click before anything is built. The
pipeline: ground in the real code → build contrasting directions as a private
claude.ai artifact → Karim picks → write the decision into `PLAN.md` → build
it. A prototype is a decision tool, not a deliverable: the repo never sees the
artifact, and its whole job is to make the choice obvious.

This project exists because of one of these. The four directions — Sumi,
Terminal, Paper, Ambient — were prototyped before a line was written, and
Karim picked ink for reviews and paper for lessons from the artifact alone.

## Ground before you draw

- **Read the real components and CSS you're reimagining.** `src/index.css`
  holds both surfaces' tokens; `src/components/` holds what has shipped. Lead
  with a diagnosis of what's actually there — the prototypes that land start
  from one ("WaniKani floods the screen with subject colour", "the queue
  count is the only thing telling you how much is left").
- **Lift the real tokens.** Copy the `:root` block from `src/index.css`
  verbatim into the artifact so what Karim approves is what the app can
  actually render. Do not eyeball the ink or the vermilion.
- **Respect the standing aesthetic.** De-boxed: no borders or cards that only
  group things. The house pattern is a hairline that lights, not an outlined
  box. A prototype full of boxes reads instantly wrong.
- **Read PLAN.md.** The design section already specifies both surfaces in
  words and hex. A prototype that contradicts it needs to say so on purpose.

## Shape the exploration

- **Open design space → one artifact, 3–5 genuinely contrasting directions**
  behind a switcher. Contrast means different bets, not shades of one idea.
  The founding artifact's four bets: the character is the interface / speed
  is the luxury / lessons are reading material / pace it emotionally.
- **Settled direction → one artifact, all states, wired.** asking · correct ·
  incorrect · retry-nudge · empty queue · syncing · session end, with real
  transitions. An unwired flow hides exactly the states that later bite —
  and in this app the retry-nudge and the wrong-answer state are where the
  design earns or loses trust.
- Every artifact gets **both surfaces where relevant** (a change to lessons
  still has to sit next to reviews), **real content**, and
  **compare-with-WaniKani**: the current site's rendition of the same moment
  beside each direction. That comparison is the whole argument — the reason
  this client exists is that WaniKani's own screen is being replaced.

## Content rules

- **Same content in every direction.** The comparison must be the design, not
  the data.
- **Real subjects, real readings.** 山 is さん/やま and means mountain; 火山
  is かざん and means volcano, with 山 voicing after か. Wrong Japanese in a
  mockup gets read as a design flaw. Never lorem, never placeholder boxes.
- **Write your own mnemonics.** WaniKani's are Tofugu's copyright and must
  not be pasted into an artifact. Write fresh ones that are actually good —
  a bad mnemonic makes a good layout look bad.
- **Honour the subject colours.** radical `#00aaff`, kanji `#ff00aa`,
  vocabulary `#aa00ff`. They are information. A direction that drops them
  entirely has to justify what replaces them.
- **Radicals may have no Unicode character** — if a direction shows one, show
  how the SVG asset behaves on that ground.

## Build mechanics

- Load the `artifact-design` skill before writing the page. Write the HTML in
  the scratchpad, never the repo; publish with the Artifact tool. Artifacts
  stay private; keep a stable favicon across redeploys of the same one.
- `references/artifact-harness.md` has the working skeleton for
  surface × direction × state switching. Start from it.
- The artifact CSP blocks webfonts. Both surfaces already rely on system
  Hiragino/Yu/Noto stacks, so this costs nothing — do not inline font files.
- Iterate on the **same file path → same URL** as feedback lands. In a later
  session, find the URL with `Artifact action:"list"` and pass `url` to
  update; a new path mints a new link and orphans the old one.

## Deliver minimally

Karim reads short messages. Send the link plus one line per direction naming
its bet, and one more line with your recommendation — he wants the opinion.
Then stop. If he's unsure, **sharpen the artifact** — more real content, the
WaniKani comparison, the states you skipped — rather than pushing for a
decision or narrowing the options for him.

## After the pick

- **Write the decision into `PLAN.md`**, in the design section, in words and
  hex. An agent picking up a phase **cannot open a private artifact** — if
  the spec lives only in the artifact, it does not exist. Include what was
  rejected; rejections carry as much as picks.
- If the pick changes a phase that is already written, amend that phase's
  acceptance criteria rather than leaving the old ones to contradict it.
- An idea Karim rejects outright: leave the artifact private, note the
  rejection, move on. No repo residue.

## When not to reach for this

An already-decided or mechanical change goes straight to the build. Prototype
when the open question is what something should look or feel like and a
clickable answer beats prose.

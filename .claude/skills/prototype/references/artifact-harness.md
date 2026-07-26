# Artifact harness — surface × direction × state

The skeleton every kanigami prototype re-derives. Copy it, delete what the
idea doesn't need (a single-surface change needs no surface bar; a settled
direction needs no direction bar).

## Lifting the app's CSS

Paste, verbatim, from `src/index.css` into the artifact's `<style>`:

1. **The whole `:root` block** — both surfaces' tokens live there together
   (`--ink*`, `--paper*`, `--vermilion`, `--seal`, the `--wk-*` subject
   colours, the font stacks).
2. **Any surface rule touching what you're drawing** — `.surface-ink`, the
   `.field` hairline behaviour, `.glyph` sizing. This is where the character
   of the design lives; tokens alone render a flat version, and the flat
   version is what gets judged.

Recreate the baseline the artifact page doesn't inherit:

```css
body {
  margin: 0; background: var(--ink); color: var(--ink-text);
  font-family: var(--sans); line-height: 1.55;
}
```

Unlike a themed app, kanigami's two surfaces are **committed worlds**: ink is
always dark, paper is always warm stock. Do not wire `prefers-color-scheme`
into the mocks themselves — a paper lesson does not have a dark mode, it has
a night stock, and that is a design decision to draw, not a media query.

## Skeleton

```html
<title>kanigami — <idea> directions</title>
<style>
  /* pasted :root + surface rules from src/index.css */
  body { margin:0; background:var(--ink); color:var(--ink-text);
         font-family:var(--sans); line-height:1.55 }
  .bar { display:flex; flex-wrap:wrap; gap:7px; padding:10px 14px }
  .bar button { font-family:var(--mono); font-size:12px; cursor:pointer;
    border:1px solid var(--ink-line); border-radius:2px;
    background:transparent; color:var(--ink-dim); padding:7px 13px }
  .bar button[aria-pressed="true"] { background:var(--ink-text);
    border-color:var(--ink-text); color:var(--ink) }
  section[hidden], [hidden] { display:none !important }
  .wk { opacity:.95 } /* compare-with-WaniKani column */
</style>

<nav class="bar" id="dirs"></nav>
<nav class="bar" id="states"></nav>

<main>
  <section data-dir="A">
    <!-- direction A, filled with real subjects -->
    <!-- one wrapper per state, toggled by the state bar -->
    <aside class="wk"><!-- wanikani.com's rendition, same moment --></aside>
  </section>
  <section data-dir="B" hidden>…</section>
</main>

<script>
const DIRS = [['A','Direction name'],['B','Other bet']]
const STATES = [['asking','Asking'],['correct','Correct'],['wrong','Wrong']]
const mk = (host, items, on) => items.forEach(([id,label],i) => {
  const b = Object.assign(document.createElement('button'), {textContent: label})
  b.onclick = () => { host.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); on(id) }
  host.append(b); if (!i) b.click()
})
mk(document.getElementById('dirs'), DIRS, d =>
   document.querySelectorAll('main > section').forEach(s => s.hidden = s.dataset.dir !== d))
mk(document.getElementById('states'), STATES, s =>
   document.querySelectorAll('[data-state]').forEach(el => el.hidden = el.dataset.state !== s))
</script>
```

Wire the real transitions where the feel is the point — typing into the field,
Enter, the rule lighting, the next subject arriving. A clickable flow is what
separates this from a screenshot.

## Content rules

- **Same subjects in every direction.** Different sample content quietly
  biases the choice.
- **Seed set to adapt, not a fixture to keep** — all verified, all early
  levels so the comparison is honest:
  - radical 口 — mouth
  - kanji 山 — mountain, on'yomi サン, kun'yomi やま, 3 strokes, level 1
  - vocabulary 火山 — かざん, volcano (火 fire + 山 mountain, 山 voicing to
    ざん after か)
  - sentence 火山が噴火した。— "The volcano erupted."
- **Mnemonics are written fresh**, never pasted from WaniKani. One that works
  for 山: three peaks off one ridge, the middle tallest — count them aloud,
  さん, and the reading comes with the picture.
- **Realistic session numbers**: queues like 12 or 143, accuracy in the
  low 90s, SRS spreads that look like a real account (apprentice 64, guru
  212, master 88). Never round demo values.
- The compare-with-WaniKani column reproduces the **current site**: full-bleed
  subject colour, white glyph, white input box, dark grey info bar at the
  bottom. Reproduce it honestly — an unfairly ugly strawman makes the whole
  artifact untrustworthy.

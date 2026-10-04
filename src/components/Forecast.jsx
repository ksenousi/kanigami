import { forecast, nextDue, peak } from '../lib/standing.js'
import Hint from './Hint.jsx'
import { clock } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import usePointing from './usePointing.js'

// The footline track, carrying the next 24 hours.
//
// Every screen already draws a 1px rule across the bottom. On home that rule
// is the forecast: the summary's 25 buckets — the current hour and the 24
// after it — rising from the rule as segments, the next few warm, empty
// hours staying exactly as tall as the rule they are part of. Nothing here
// is a chart — it is the rule, told what it knows.
//
// **The backlog does not set the scale.** WaniKani's first bucket holds
// everything already due, which on a neglected account is larger than the
// rest of the day put together — and it is already the biggest number on the
// screen above. Letting it scale the rule spends the whole width saying that
// twice and flattens the twenty-three hours this exists to show. So the
// current hour is a narrow full-height tick, a marker rather than a quantity,
// and the hours after it are scaled among themselves.
//
// **Hovering an hour re-points the label** rather than floating a box over
// the page. The line of type is already there and already says something
// about the forecast; under the cursor it says something more specific. No
// tooltip, no card, nothing that appears and covers.
//
// **And the keyboard gets the same reading.** The per-hour counts exist
// nowhere else in the app, so leaving them behind a pointer left them out of
// reach entirely for anyone not using one. The track takes focus and the
// arrows walk it; the label is the live region, so what a sighted user reads
// under the cursor is the same string a screen reader is handed.
const TALLEST = 20
const WARM = 4 // hours after this one that stay near the accent

//
// **The kanji the level-up waits on are marked above their hour** — the hour
// each next comes up, in strong ink when one right answer passes it, softer
// when it has further to go — and the hour's readout names them. `waitingOn`
// is levelUpKanji's list; one outside these 25 hours is simply not marked.
export default function Forecast({ summary, waitingOn = [], nextLevel = null }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  // Unclipped: WaniKani sends now plus 24 hours, and the +24h at the far end
  // of the track is only true if the twenty-fourth is actually drawn.
  const hours = forecast(summary)
  const tallest = peak(hours.slice(1))
  const marks = markHours(hours, waitingOn)
  // Marks in neighbouring hours would run together into one word, so each
  // one right after a low one is lifted a row, on a longer tick.
  const lifted = new Set()
  for (const index of [...marks.keys()].sort((a, b) => a - b)) {
    if (marks.has(index - 1) && !lifted.has(index - 1)) lifted.add(index)
  }

  return (
    <>
      <div className={['footline forecast', marks.size ? 'marked' : '', lifted.size ? 'lifted' : ''].join(' ').trim()}>
        {/* The label is the live region, so the arrows announce as they walk.
            It is `polite`, because this reads while somebody is deliberately
            stepping through hours and should not interrupt anything. */}
        <span className="when" aria-live="polite">
          {reading === null ? nextLabel(summary, hours[0]) : hourLabel(hours[reading], reading, marks.get(reading))}
        </span>

        <div
          className="track hours"
          role="group"
          aria-label="Reviews due over the next 24 hours"
          onKeyDown={walk(hours.length, reading, point)}
          {...groupProps}
        >
          {hours.map((hour, index) => (
            <span
              key={hour.at}
              className={`hour${warmth(hour, index)}${reading === index ? ' reading' : ''}`}
              // A mouse reads on hover; a tap reads and holds — see usePointing.
              {...itemProps(index)}
            >
              <i style={{ height: `${height(hour, index, tallest)}px` }} />
              {marks.has(index) ? (
                <span
                  className={['mark', marks.get(index).some(k => k.stage === 4) ? '' : 'quiet', lifted.has(index) ? 'up' : '']
                    .join(' ')
                    .trim()}
                  aria-hidden="true"
                >
                  <span className="kanji-name">{marks.get(index).map(k => k.characters).join('')}</span>
                </span>
              ) : null}
            </span>
          ))}
        </div>

        <span>+24h</span>

        {/* The hours read out like the kanji and the bars do, and say so the
            same way. At the far end, after the track, so the label that
            changes under the cursor keeps its place. */}
        <Hint pointer="Point at" touch="Tap">
          an hour
        </Hint>
      </div>
      {marks.size ? (
        <p className="notes forecast-key">
          <span className="hint">
            Marked: the kanji level {nextLevel} waits on, at the hour each comes up · in strong ink, one step from
            passing
          </span>
        </p>
      ) : null}
    </>
  )
}

// Which hour each of the level-up's kanji next comes up in: the bucket its
// `available_at` falls in, today's backlog for one already due. Lessons have
// no review yet, and anything past the last bucket is off the strip.
function markHours(hours, waitingOn) {
  const marks = new Map()
  if (hours.length === 0) return marks
  const starts = hours.map(h => Date.parse(h.at))
  for (const k of waitingOn) {
    if (!k.availableAt) continue
    const at = Date.parse(k.availableAt)
    if (at >= starts[starts.length - 1] + 60 * 60 * 1000) continue
    let index = 0
    for (let i = 0; i < starts.length; i++) if (starts[i] <= at) index = i
    if (!marks.has(index)) marks.set(index, [])
    marks.get(index).push(k)
  }
  return marks
}

// Left and right walk an hour, Home and End go to the ends, Escape gives the
// label back to its resting state. Returns a handler rather than closing over
// the component's scope, so the walk is nothing but arithmetic.
function walk(count, now, point) {
  return function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
      // The first press lands on the current hour whichever way it went,
      // rather than stepping off a resting label and skipping hour zero.
      point(now === null ? 0 : Math.min(count - 1, Math.max(0, now + step)))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      point(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      point(count - 1)
    }
    if (event.key === 'Escape') point(null)
  }
}

// The current hour is a marker, not a measurement: full height when anything
// is waiting, and part of the baseline when nothing is. Everything after it
// is proportional to the busiest hour still to come.
function height(hour, index, tallest) {
  if (hour.count === 0) return 1
  if (index === 0) return TALLEST + 4
  if (tallest === 0) return 1
  return Math.max(2, Math.round((hour.count / tallest) * TALLEST))
}

// Only an hour with something in it gets any warmth. Lighting an empty
// current hour makes an empty queue look like a full one.
function warmth(hour, index) {
  if (hour.count === 0) return ''
  if (index === 0) return ' now'
  return index <= WARM ? ' soon' : ''
}


// What the label says while an hour is under the cursor.
function hourLabel(hour, index, marked) {
  if (!hour) return ''
  const base =
    index === 0 ? `${hour.count} due now` : hour.count === 0 ? `${clock(hour.at)} · none` : `${clock(hour.at)} · ${hour.count}`
  if (!marked) return base
  return `${base} · ${marked.map(k => `${k.characters} ${k.stage === 4 ? 'to pass' : stageName(k.stage)}`).join(', ')}`
}

// The first bucket is the current hour, so it already says whether anything
// is due — no need to compare its timestamp against the clock, which got this
// wrong whenever the two disagreed. If nothing is due now, the next bucket
// holding anything is in the future by definition.
function nextLabel(summary, now) {
  if (now?.count > 0) return `${now.count} due`

  const when = nextDue(summary)
  return when ? `next at ${clock(when)}` : 'nothing in 24h'
}

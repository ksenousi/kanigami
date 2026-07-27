import { useState } from 'react'
import { forecast, nextDue, peak } from '../lib/standing.js'

// The footline track, carrying the next 24 hours.
//
// Every screen already draws a 1px rule across the bottom. On home that rule
// is the forecast: 24 segments rising from it, the next few warm, empty hours
// staying exactly as tall as the rule they are part of. Nothing here is a
// chart — it is the rule, told what it knows.
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
const HOURS = 24
const TALLEST = 20
const WARM = 4 // hours after this one that stay near the accent

export default function Forecast({ summary }) {
  const [reading, setReading] = useState(null)
  const hours = forecast(summary, HOURS)
  const tallest = peak(hours.slice(1))

  return (
    <div className="footline forecast">
      <span className="when">
        {reading === null ? nextLabel(summary, hours[0]) : hourLabel(hours[reading], reading)}
      </span>

      <div
        className="track hours"
        onPointerLeave={() => setReading(null)}
      >
        {hours.map((hour, index) => (
          <span
            key={hour.at}
            className={`hour${warmth(hour, index)}${reading === index ? ' reading' : ''}`}
            // Pointer rather than mouse, so a tap on a touch screen reads the
            // same hour a hover would.
            onPointerEnter={() => setReading(index)}
            onPointerDown={() => setReading(index)}
          >
            <i style={{ height: `${height(hour, index, tallest)}px` }} />
          </span>
        ))}
      </div>

      <span>+{HOURS}h</span>
    </div>
  )
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

function clock(at) {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// What the label says while an hour is under the cursor.
function hourLabel(hour, index) {
  if (!hour) return ''
  if (index === 0) return `${hour.count} due now`
  if (hour.count === 0) return `${clock(hour.at)} · none`
  return `${clock(hour.at)} · ${hour.count}`
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

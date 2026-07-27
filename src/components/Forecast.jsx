import { forecast, nextDue, peak } from '../lib/standing.js'

// The footline track, carrying the next 24 hours.
//
// Every screen already draws a 1px rule across the bottom. On home that rule
// is the forecast: 24 segments rising from it, the current hour lit, the
// next few warm, empty hours staying exactly as tall as the rule they are
// part of. Nothing here is a chart — it is the rule, told what it knows.
const HOURS = 24
const TALLEST = 22
const WARM = 4 // hours after this one that stay near the accent

export default function Forecast({ summary }) {
  const hours = forecast(summary, HOURS)
  const tallest = peak(hours)

  return (
    <div className="footline forecast">
      <span className="when">{nextLabel(summary)}</span>

      <div className="track hours" aria-hidden="true">
        {hours.map((hour, index) => (
          <span
            key={hour.at}
            className={`hour${warmth(hour, index)}`}
            style={{ height: `${height(hour.count, tallest)}px` }}
          />
        ))}
      </div>

      <span>+{HOURS}h</span>
    </div>
  )
}

// An empty hour is 1px — the baseline itself, not a gap in it. Everything
// else is proportional to the busiest hour on screen.
function height(count, tallest) {
  if (count === 0 || tallest === 0) return 1
  return Math.max(2, Math.round((count / tallest) * TALLEST))
}

// Only an hour with something in it gets any warmth. Lighting an empty
// current hour makes an empty queue look like a full one.
function warmth(hour, index) {
  if (hour.count === 0) return ''
  if (index === 0) return ' now'
  return index <= WARM ? ' soon' : ''
}

function nextLabel(summary) {
  const when = nextDue(summary)
  if (!when) return 'nothing in 24h'

  const at = new Date(when)
  if (at <= new Date()) return 'due now'
  return `next at ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

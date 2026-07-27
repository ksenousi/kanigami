import { forecast, nextDue, peak } from '../lib/standing.js'

// The footline track, carrying the next 24 hours.
//
// Every screen already draws a 1px rule across the bottom. On home that rule
// is the forecast: 24 segments rising from it, the current hour lit, the
// next few warm, empty hours staying exactly as tall as the rule they are
// part of. Nothing here is a chart — it is the rule, told what it knows.
//
// **The backlog does not set the scale.** WaniKani's first bucket holds
// everything already due, which on a neglected account is larger than the
// rest of the day put together — and it is already the biggest number on the
// screen above. Letting it scale the rule spends the whole width saying that
// twice and flattens the twenty-three hours this exists to show. So the
// current hour is drawn full height as a marker, and the hours after it are
// scaled among themselves.
const HOURS = 24
const TALLEST = 20
const WARM = 4 // hours after this one that stay near the accent

export default function Forecast({ summary }) {
  const hours = forecast(summary, HOURS)
  const [now, ...ahead] = hours
  const tallest = peak(ahead)

  return (
    <div className="footline forecast">
      <span className="when">{nextLabel(summary, now)}</span>

      <div className="track hours" aria-hidden="true">
        {hours.map((hour, index) => (
          <span
            key={hour.at}
            className={`hour${warmth(hour, index)}`}
            style={{ height: `${height(hour, index, tallest)}px` }}
          />
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

function nextLabel(summary, now) {
  const when = nextDue(summary)
  if (!when) return 'nothing in 24h'

  const at = new Date(when)
  if (at <= new Date()) {
    // Something is already due. Say how much, and when the next lot lands.
    return `${now.count} due`
  }
  return `next at ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

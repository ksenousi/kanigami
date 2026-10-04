import { forecast, nextDue, peak } from '../lib/standing.js'
import { clock, count as many, weekday } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import Hint from './Hint.jsx'
import usePointing from './usePointing.js'

// 刻 The next 24 hours, every hour named — decided from a prototype (see
// "The next 24 hours" in PLAN.md). It was a 24px strip with no times on it:
// you pointed at an hour to learn when it was. Now it is a small bar chart
// that reads without pointing.
//
// - **One column per bucket** of the summary — the current hour and the 24
//   after it — each with its two-digit hour beneath the baseline: bright when
//   reviews arrive then, `--dim` when the hour is empty, the current hour in
//   the accent. Above, today and tomorrow are named where each begins.
// - **Each bar carries its count**, and the kanji the level-up waits on sit
//   above the bar of the hour they come up in — strong ink when one right
//   answer passes them, softer otherwise.
// - **The backlog does not set the scale.** WaniKani's first bucket holds
//   everything already due, which on a neglected account outweighs the rest
//   of the day and is already the largest figure above. It is drawn in the
//   accent and stops at the top with an arrow, and the other hours are
//   scaled among themselves.
// - **Pointing at a bar, or tapping it, re-points the line beneath** to that
//   hour in words — its slot, its count, the kanji in it. The arrows walk the
//   hours from the keyboard; the line is the live region.
const TALLEST = 96 // px, the busiest hour after this one

export default function Forecast({ summary, waitingOn = [], nextLevel = null }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  // Unclipped: WaniKani sends now plus 24 hours, and all of them are drawn.
  const hours = forecast(summary)
  const busiest = Math.max(1, peak(hours.slice(1)))
  const marks = markHours(hours, waitingOn)
  const today = hours[0] ? new Date(hours[0].at).toDateString() : null
  const midnight = hours.findIndex((h, i) => i > 0 && new Date(h.at).toDateString() !== today)
  const share = i => `${(i / Math.max(1, hours.length)) * 100}%`

  return (
    <section className="forecast" aria-label="Reviews over the next 24 hours">
      <div className="days" aria-hidden="true">
        <span style={{ left: 0 }}>today</span>
        {midnight > 0 ? <span style={{ left: share(midnight) }}>{weekday(hours[midnight].at)}</span> : null}
      </div>

      <div
        className="hours"
        role="group"
        aria-label="Reviews due in each of the next 24 hours"
        style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
        onKeyDown={walk(hours.length, reading, point)}
        {...groupProps}
      >
        {hours.map((hour, index) => {
          const capped = index === 0 && hour.count > busiest
          const height = hour.count
            ? Math.max(3, Math.round(((capped ? busiest : hour.count) / busiest) * TALLEST))
            : 0
          const kanji = marks.get(index)
          return (
            <span
              key={hour.at}
              className={[
                'hour',
                hour.count ? 'busy' : '',
                index === 0 ? 'now' : '',
                kanji ? 'marked' : '',
                reading === index ? 'reading' : ''
              ]
                .join(' ')
                .trim()}
              // A mouse reads on hover; a tap reads and holds — see usePointing.
              {...itemProps(index)}
            >
              <span className="stack">
                {kanji ? (
                  <span className={kanji.some(k => k.stage === 4) ? 'mark' : 'mark quiet'} aria-hidden="true">
                    <span className="kanji-name">{kanji.map(k => k.characters).join('')}</span>
                  </span>
                ) : null}
                {hour.count ? (
                  <span className="n">
                    {many(hour.count)}
                    {capped ? '↑' : ''}
                  </span>
                ) : null}
                <i style={{ height: `${height}px` }} />
              </span>
              <span className="at">{String(new Date(hour.at).getHours()).padStart(2, '0')}</span>
            </span>
          )
        })}
      </div>

      <p className="notes readout" aria-live="polite">
        <span className="soft">
          {reading === null ? resting(summary, hours) : hourLabel(hours, reading, today, marks.get(reading))}
        </span>
        <span className="hint">
          Count above each bar
          {marks.size ? ` · the kanji level ${nextLevel} waits on above theirs, strong ink one step from passing` : ''}
        </span>
        <Hint pointer="Point at" touch="Tap">
          a bar for its hour
        </Hint>
      </p>
    </section>
  )
}

// Which hour each of the level-up's kanji next comes up in: the bucket its
// `available_at` falls in, the current hour for one already due. Lessons have
// no review yet, and anything past the last bucket is off the chart.
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
// line back to its resting state. The first press lands on the current hour
// whichever way it went, rather than stepping off and skipping hour zero.
function walk(count, now, point) {
  return function key(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
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

// What the line says while an hour is read: its slot, its count, and the
// level-up's kanji in it.
function hourLabel(hours, index, today, marked) {
  const hour = hours[index]
  if (!hour) return ''
  const start = new Date(hour.at)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const slot =
    index === 0 ? 'Now' : `${clock(start)}–${clock(end)}${start.toDateString() !== today ? ` ${weekday(start)}` : ''}`
  const count = index === 0 ? `${many(hour.count)} due` : hour.count ? `${many(hour.count)} reviews` : 'none'
  const kanji = marked
    ? ` · ${marked.map(k => `${k.characters} ${k.stage === 4 ? 'to pass' : stageName(k.stage)}`).join(', ')}`
    : ''
  return `${slot} · ${count}${kanji}`
}

// The line at rest: what is due now, or when the next ones come, and the
// day's total. The first bucket is the current hour, so it already says
// whether anything is due.
function resting(summary, hours) {
  const total = hours.reduce((sum, h) => sum + h.count, 0)
  const now = hours[0]?.count ?? 0
  if (now > 0) return `${many(now)} due now · ${many(total - now)} more by this time tomorrow`
  const next = nextDue(summary)
  if (!next) return 'Nothing due in the next 24 hours'
  return `Nothing due now · next at ${clock(next)} · ${many(total)} by this time tomorrow`
}

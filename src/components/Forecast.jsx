import { forecast, nextDue, peak } from '../lib/standing.js'
import { clock, count as many, weekday } from '../lib/dates.js'
import { stageName } from '../lib/srs.js'
import Specimen from './Specimen.jsx'
import usePointing from './usePointing.js'

// 刻 The week ahead, every hour named — decided from a prototype (see
// "The next 24 hours" in PLAN.md). It was a 24px strip with no times on it:
// you pointed at an hour to learn when it was. Now it is a small bar chart
// that reads without pointing.
//
// - **One column per hour, a week of them** — the summary's 25 buckets, then
//   the hours after counted from the assignments' own `available_at` (see
//   `forecastAhead`). The first 25 fill the strip's width as they always did;
//   the rest scroll sideways into view. Each has its two-digit hour beneath
//   the baseline: bright when reviews arrive then, `--dim` when the hour is
//   empty, the current hour in the accent. Above, each day is named where it
//   begins, a dashed line runs down at every midnight, and every other day
//   sits on a faint tint, so the day boundaries read before any label does.
// - **Each bar carries its count**, and what the level-up waits on — every
//   kanji not yet passed, and the radicals holding its locked ones — sits
//   above the bar of the hour it comes up in: strong ink when one right
//   answer passes it, softer otherwise, wrapped inside the hour's own
//   column, three at most and `+n` for the rest.
// - **The backlog does not set the scale.** WaniKani's first bucket holds
//   everything already due, which on a neglected account outweighs the rest
//   of the day and is already the largest figure above. It is drawn in the
//   accent and stops at the top with an arrow, and the other hours are
//   scaled among themselves.
// - **Pointing at a bar, or tapping it, re-points the line beneath** to that
//   hour in words — its slot, its count, the kanji in it. The arrows walk the
//   hours from the keyboard; the line is the live region. At rest it is the
//   day's total and nothing else: the lines that explained the counts, the
//   marks and the pointing went with "One slot" in PLAN.md.
//
// Each bar is a share of the tallest (`--h`, 0–1); the CSS says how tall the
// tallest is — 96px on its own, taller in the column beside the level.

// The most kanji drawn over one hour. A dozen on one line ran across the
// hours either side and into the next hour's own; the rest are a count, and
// the hour read on a tap names them all. The ones a right answer passes come
// first.
const SHOWN = 3

export default function Forecast({ summary, hours: given = null, waitingOn = [] }) {
  const { at: reading, point, groupProps, itemProps } = usePointing()
  // A week when the board hands one over; otherwise the summary's 25 hours.
  const hours = given ?? forecast(summary)
  const busiest = Math.max(1, peak(hours.slice(1)))
  const marks = markHours(hours, waitingOn)
  const today = hours[0] ? new Date(hours[0].at).toDateString() : null
  const days = dayStarts(hours)
  const dayOf = hourDays(hours.length, days)

  return (
    <section className="forecast" aria-label="Reviews over the week ahead">
      {/* The strip: the first 25 hours fill its width and the rest of the
          week scrolls sideways. On a phone an hour keeps 26px, wide enough to
          name. */}
      <div className="strip">
        <div
          className="days"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))`, '--span': hours.length / DAY_HOURS }}
        >
          {/* Each name spans its day's hours and holds to the strip's left
              edge while the day is in view, so a scrolled strip still says
              which day it is. A day of a couple of hours is too narrow for
              its name, so the name goes and the rule stays. */}
          {days.map((start, d) => {
            const end = days[d + 1] ?? hours.length
            return (
              <span key={start} style={{ gridColumn: `${start + 1} / ${end + 1}` }}>
                {end - start >= NAMED ? <b>{d === 0 ? 'today' : weekday(hours[start].at)}</b> : null}
              </span>
            )
          })}
        </div>

        <div
          className="hours"
          role="group"
          aria-label="Reviews due in each hour of the week ahead"
          style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))`, '--span': hours.length / DAY_HOURS }}
          onKeyDown={walk(hours.length, reading, point)}
          {...groupProps}
        >
          {hours.map((hour, index) => {
            const capped = index === 0 && hour.count > busiest
            const height = hour.count ? Math.round(((capped ? busiest : hour.count) / busiest) * 1000) / 1000 : 0
            const kanji = marks.get(index)
            return (
              <span
                key={hour.at}
                className={[
                  'hour',
                  hour.count ? 'busy' : '',
                  index === 0 ? 'now' : '',
                  dayOf[index] % 2 ? 'next-day' : '',
                  index > 0 && dayOf[index] !== dayOf[index - 1] ? 'midnight' : '',
                  kanji ? 'marked' : '',
                  reading === index ? 'reading' : '',
                  reading !== null && reading !== index ? 'aside' : ''
                ]
                  .join(' ')
                  .trim()}
                // A mouse reads on hover; a tap reads and holds — see usePointing.
                {...itemProps(index)}
              >
                <span className="stack">
                  {kanji ? (
                    <span className="mark" aria-hidden="true">
                      {kanji.slice(0, SHOWN).map(k => (
                        <span key={k.id ?? k.characters} className={k.stage === 4 ? '' : 'quiet'}>
                          {k.characters ?? (k.image ? <img src={k.image} alt="" /> : '〓')}
                        </span>
                      ))}
                      {kanji.length > SHOWN ? <span className="more">+{kanji.length - SHOWN}</span> : null}
                    </span>
                  ) : null}
                  {hour.count ? (
                    <span className="n">
                      {many(hour.count)}
                      {capped ? '↑' : ''}
                    </span>
                  ) : null}
                  <i style={{ '--h': height }} />
                </span>
                <span className="at">{String(new Date(hour.at).getHours()).padStart(2, '0')}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* At rest the day's total; pointing at an hour reads it as a
          specimen in the same place, which keeps the specimen's height so
          nothing under the forecast moves (PLAN.md, "The specimen"). */}
      <div className="readout" aria-live="polite">
        {reading === null ? (
          <p className="notes">
            <span className="soft">{resting(summary, hours.slice(0, DAY_HOURS))}</span>
          </p>
        ) : (
          <HourSpecimen hours={hours} index={reading} today={today} marked={marks.get(reading)} />
        )}
      </div>
    </section>
  )
}

// The summary's day: the current hour and the 24 after it. It is the width
// the strip shows at once, and what "by this time tomorrow" sums.
const DAY_HOURS = 25

// The fewest hours a day needs on the strip before it carries its name.
const NAMED = 3

// Where each day begins: hour zero, then every hour on a new date.
function dayStarts(hours) {
  const starts = hours.length ? [0] : []
  for (let i = 1; i < hours.length; i++) {
    if (new Date(hours[i].at).toDateString() !== new Date(hours[i - 1].at).toDateString()) starts.push(i)
  }
  return starts
}

// Which day, counting from today, each hour falls on.
function hourDays(length, starts) {
  const days = Array.from({ length }, () => 0)
  starts.forEach((start, d) => days.fill(d, start))
  return days
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
  for (const kanji of marks.values()) kanji.sort((a, b) => (b.stage === 4) - (a.stage === 4))
  return marks
}

// A mark in words: its character, or a radical's meaning when it has none.
function named(k) {
  return k.radical ? `${k.characters ?? k.meaning} radical` : k.characters
}

// Left and right walk an hour, Home and End go to the ends, Escape gives the
// line back to its resting state. The first press lands on the current hour
// whichever way it went, rather than stepping off and skipping hour zero.
// The strip scrolls, so the hour landed on is brought into view.
function walk(count, now, point) {
  return function key(event) {
    const go = index => {
      point(index)
      event.currentTarget.children[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
      go(now === null ? 0 : Math.min(count - 1, Math.max(0, now + step)))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      go(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      go(count - 1)
    }
    if (event.key === 'Escape') point(null)
  }
}

// An hour, read: its count large, the hour beside it, and under them the
// level-up's kanji in it, grouped by stage, each group in its stage's hue —
// the ones a right answer passes first.
function HourSpecimen({ hours, index, today, marked }) {
  const hour = hours[index]
  if (!hour) return null
  const start = new Date(hour.at)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const slot = `${clock(start)}–${clock(end)}${start.toDateString() !== today ? ` ${weekday(start)}` : ''}`
  const what = index === 0 ? 'due now' : hour.count === 1 ? 'review' : 'reviews'
  const stages = [...new Set((marked ?? []).map(k => k.stage))].sort((a, b) => b - a)
  return (
    <Specimen
      glyph={many(hour.count)}
      kind={['number', index === 0 && hour.count ? 'hot' : '', hour.count ? '' : 'none'].join(' ')}
      named={index === 0 ? what : `${what} · ${slot}`}
      where={
        stages.length
          ? stages.map((stage, i) => (
              <span key={stage}>
                {i ? ' · ' : ''}
                <span className={`stage a${stage}`}>
                  {marked
                    .filter(k => k.stage === stage)
                    .map(named)
                    .join(' ')}{' '}
                  {stage === 4 ? 'to pass' : stageName(stage)}
                </span>
              </span>
            ))
          : null
      }
    />
  )
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

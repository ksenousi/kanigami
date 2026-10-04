// Every date and time on the board, in one shape whatever the browser's
// language: `Wed 7 Oct 19:00`, `7 Oct`, `7 Oct 2026`, `Oct 2026`. The board
// used the browser's locale and came out in four shapes at once — `Sept`
// from an en-GB browser, `Oct 7` and `7:00 PM` from an en-US one. Local
// time throughout: these are when things happen to you.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const two = n => String(n).padStart(2, '0')

export function clock(at) {
  const d = new Date(at)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

export function dayMonth(at) {
  const d = new Date(at)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function dayMonthYear(at) {
  const d = new Date(at)
  return `${dayMonth(d)} ${d.getFullYear()}`
}

export function monthYear(at) {
  const d = new Date(at)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function weekday(at) {
  return DAYS[new Date(at).getDay()]
}

// A moment: the hour alone today, the day and the hour after that.
export function when(at, now = new Date()) {
  const d = new Date(at)
  if (d.toDateString() === new Date(now).toDateString()) return `today ${clock(d)}`
  return `${weekday(d)} ${dayMonth(d)} ${clock(d)}`
}

// A projected date, as precise as a projection deserves: the day within a
// few months, the month beyond.
export function roughly(at, now = new Date()) {
  const months = (new Date(at) - new Date(now)) / (30 * 24 * 60 * 60 * 1000)
  return months < 3 ? dayMonth(at) : monthYear(at)
}

// Numbers too, for the same reason: `1,500` whatever the locale.
export function count(n) {
  return n.toLocaleString('en')
}

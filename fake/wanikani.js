// A fake WaniKani for `npm run dev:fake` — the real app, no token, no
// account. vite.config.js inlines this into the page ahead of the app, only
// on the dev server and only in the `fake` mode, so no build carries it.
//
// Everything here is hand-written: fake ids, a fake user, made-up counts.
// The kanji meanings and readings are plain dictionary facts; there are no
// mnemonics and nothing copied from a live response. Keep it that way — see
// "This repo is public" in CLAUDE.md.
//
// Scenarios, by query string — /kanigami/?fake=slow and so on:
//   (none)         level 15, day 13, a working account
//   fresh          level 1 on its first day: no history, no pace
//   slow           the core reads take a second, each commentary read 2.5s
//   offline        every request fails as if the network were gone
//   revoked        WaniKani refuses the token (401)
//   radicals-fail  the level's radicals do not load when switched to
;(() => {
  const scenario = new URLSearchParams(location.search).get('fake') || 'default'
  const TOKEN = '00000000-0000-0000-0000-000000000000'
  try {
    localStorage.setItem('kanigami-token', TOKEN)
  } catch {
    // no storage, no token: the gate shows, which is fine
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.title = `[fake: ${scenario}] ${document.title}`
  })

  const H = 3600e3
  const D = 24 * H
  const now = Date.now()
  const hour0 = Math.floor(now / H) * H
  const iso = t => new Date(t).toISOString()
  const page = data => ({ object: 'collection', data, pages: { next_url: null }, total_count: data.length })
  const fresh = scenario === 'fresh'
  const LEVEL = fresh ? 1 : 15

  // --- the level's kanji ---
  const KANJI = fresh
    ? [['大', 'big'], ['口', 'mouth'], ['山', 'mountain'], ['川', 'river'], ['人', 'person'], ['入', 'enter']]
    : [['薬', 'medicine'], ['皿', 'dish'], ['曜', 'weekday'], ['港', 'harbor'], ['湖', 'lake'], ['橋', 'bridge'],
       ['島', 'island'], ['岸', 'shore'], ['波', 'wave'], ['泳', 'swim'], ['洋', 'ocean'], ['漁', 'fishing'],
       ['祭', 'festival'], ['際', 'occasion'], ['察', 'guess'], ['窓', 'window'], ['階', 'floor'], ['局', 'bureau'],
       ['庭', 'garden'], ['庫', 'storage'], ['箱', 'box'], ['筆', 'brush'], ['鉄', 'iron'], ['銀', 'silver'],
       ['鏡', 'mirror'], ['歯', 'tooth'], ['鼻', 'nose'], ['眼', 'eyeball'], ['涙', 'tear'], ['汗', 'sweat'],
       ['汽', 'steam'], ['械', 'machine']]
  const system = fresh ? 2 : 1
  const kanjiSubjects = KANJI.map(([characters, meaning], i) => ({
    id: 1000 + i,
    object: 'kanji',
    data: { level: LEVEL, characters, meanings: [{ meaning, primary: true }], lesson_position: i, spaced_repetition_system_id: system }
  }))
  // [srs stage, hours until its next review] per kanji; null is locked. Five
  // come up in the same hour, so the strip has a crowded one to draw.
  const STATES = fresh
    ? [[1, 1], [1, 1], [0, 0], [null], [null], [null]]
    : [[4, 2], [4, 2], [1, 13], [7, 90], [6, 40], [5, 20], [6, 33], [5, 61], [6, 12], [5, 27], [5, 8], [5, 44],
       [5, 15], [5, 70], [5, 5], [7, 120], [5, 26], [5, 19], [5, 52], [6, 38], [5, 31], [5, 22], [3, 13], [5, 66],
       [3, 13], [3, 13], [2, 13], [2, 13], [1, 13], [0, 0], [0, 0], [null]]
  const assign = (subject, type, [stage, hours]) => ({
    id: 5000 + subject.id,
    object: 'assignment',
    data: {
      subject_id: subject.id,
      subject_type: type,
      srs_stage: stage,
      unlocked_at: iso(now - 13 * D),
      started_at: stage ? iso(now - 12 * D) : null,
      passed_at: stage >= 5 ? iso(now - 4 * D) : null,
      burned_at: null,
      available_at: stage ? iso(hour0 + hours * H) : null
    }
  })
  const kanjiAssignments = kanjiSubjects.map((s, i) => (STATES[i][0] === null ? null : assign(s, 'kanji', STATES[i]))).filter(Boolean)

  // --- the level's radicals ---
  const RADICALS = fresh
    ? [['一', 'ground'], ['丨', 'stick'], ['口', 'mouth']]
    : [['工', 'construction'], ['言', 'say'], ['金', 'gold'], ['竹', 'bamboo'], ['石', 'stone'], ['耳', 'ear']]
  const radicalSubjects = RADICALS.map(([characters, meaning], i) => ({
    id: 3000 + i,
    object: 'radical',
    data: { level: LEVEL, characters, meanings: [{ meaning, primary: true }], lesson_position: i, spaced_repetition_system_id: system }
  }))
  const radicalAssignments = radicalSubjects.slice(0, -1).map((s, i) => assign(s, 'radical', i < 4 ? [5, 30] : [3, 14]))

  // --- everything started: the spread, taught, the week ---
  const started = [...kanjiAssignments]
  const add = (count, stage, type) => {
    for (let i = 0; i < count; i++) {
      const id = 20000 + started.length
      started.push({
        id: 9000 + started.length,
        object: 'assignment',
        data: {
          subject_id: id,
          subject_type: type,
          srs_stage: stage,
          started_at: iso(now - ((i * 7) % 60) * D),
          passed_at: stage >= 5 ? iso(now - ((i * 5) % 40) * D) : null,
          burned_at: stage === 9 ? iso(now - ((i * 3) % 70) * D) : null,
          available_at: stage === 9 ? null : iso(hour0 + ((i * 13) % 160) * H)
        }
      })
    }
  }
  if (fresh) {
    add(14, 1, 'radical')
  } else {
    add(40, 2, 'vocabulary')
    add(24, 3, 'kanji')
    add(212, 5, 'vocabulary')
    add(188, 7, 'kanji')
    add(341, 8, 'radical')
    add(437, 9, 'vocabulary')
  }

  // --- the summary: lessons waiting, and the next 24 hours ---
  const COUNTS = fresh
    ? [0, 0, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    : [38, 12, 7, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 9, 31, 18, 0, 0, 6, 14, 0, 3, 0, 0]
  let next = 0
  const summary = {
    object: 'report',
    data: {
      lessons: [{ available_at: iso(hour0), subject_ids: Array.from({ length: fresh ? 12 : 14 }, (_, i) => 40000 + i) }],
      reviews: COUNTS.map((count, i) => ({
        available_at: iso(hour0 + i * H),
        subject_ids: Array.from({ length: count }, () => 50000 + next++)
      }))
    }
  }

  // --- level history: fourteen levels, one long break, this one 13 days in ---
  const LENGTHS = [8, 9, 12, 14, 16, 11, 13, 17, 15, 18, 22, 12, 94, 19]
  const progressions = []
  if (fresh) {
    progressions.push({ data: { level: 1, unlocked_at: iso(now - 6 * H), passed_at: null, abandoned_at: null } })
  } else {
    let t = now - 13 * D - LENGTHS.reduce((a, b) => a + b, 0) * D
    LENGTHS.forEach((days, i) => {
      progressions.push({ data: { level: i + 1, unlocked_at: iso(t), passed_at: iso(t + days * D), abandoned_at: null } })
      t += days * D
    })
    progressions.push({ data: { level: 15, unlocked_at: iso(now - 13 * D), passed_at: null, abandoned_at: null } })
  }

  // --- what keeps slipping, and lifetime accuracy ---
  const SLIPPING = [
    ['一人暮らし', 'ひとりぐらし', 'Living Alone', 'vocabulary', 58],
    ['一応', 'いちおう', 'Just In Case', 'vocabulary', 61],
    ['必ず', 'かならず', 'Without Fail', 'vocabulary', 67],
    ['届', 'とど', 'Deliver', 'kanji', 70],
    ['具合', 'ぐあい', 'Condition', 'vocabulary', 72]
  ]
  const statistics = fresh
    ? []
    : [
        ...SLIPPING.map(([, , , type, percentage], i) => ({
          data: { subject_id: 60000 + i, subject_type: type, percentage_correct: percentage,
            meaning_correct: 9, meaning_incorrect: 4, reading_correct: 8, reading_incorrect: 5 }
        })),
        // Three of the level's own kanji, for the switch to this level.
        ...[[1026, 64], [1027, 75], [1024, 79]].map(([subject_id, percentage]) => ({
          data: { subject_id, subject_type: 'kanji', percentage_correct: percentage,
            meaning_correct: 5, meaning_incorrect: 2, reading_correct: 4, reading_incorrect: 2 }
        })),
        { data: { subject_id: 60100, subject_type: 'kanji', percentage_correct: 95,
          meaning_correct: 4100, meaning_incorrect: 380, reading_correct: 3700, reading_incorrect: 560 } }
      ]
  const slippingSubjects = SLIPPING.map(([characters, reading, meaning], i) => ({
    id: 60000 + i,
    data: { characters, meanings: [{ meaning, primary: true }], readings: [{ reading, primary: true }] }
  }))

  // --- WaniKani's two SRS systems, intervals in seconds ---
  const srs = (id, waits) => ({
    id,
    data: {
      passing_stage_position: 5,
      stages: [null, ...waits, 601200, 1206000, 2588400, 10364400, null].map((interval, position) => ({
        position,
        interval,
        interval_unit: interval === null ? null : 'seconds'
      }))
    }
  })
  const systems = [srs(1, [14400, 28800, 82800, 169200]), srs(2, [7200, 14400, 28800, 82800])]

  // --- every kanji WaniKani teaches, for coverage ---
  // A stand-in curriculum, not WaniKani's: the level's own kanji at its
  // level, every kanji already started spread over the levels before it, and
  // the rest of the Jōyō list — read from the app's own bundled list, which
  // the dev server serves — dealt out over the levels after, 2,087 in all.
  let allKanji = null
  async function everyKanji() {
    if (allKanji) return allKanji
    const { JOYO } = await import('/kanigami/src/lib/kanjiLists.js')
    const own = new Set(KANJI.map(([c]) => c))
    const pool = JOYO.flatMap(([, kanji]) => [...kanji]).filter(c => !own.has(c))
    const earlier = started.filter(a => a.data.subject_type === 'kanji' && a.data.subject_id >= 20000)
    const subjects = [...kanjiSubjects]
    earlier.forEach((a, i) => {
      subjects.push({ id: a.data.subject_id, object: 'kanji', data: { level: 1 + Math.floor((i * (LEVEL - 1)) / Math.max(1, earlier.length)) || 1, characters: pool[i] } })
    })
    const rest = pool.slice(earlier.length, earlier.length + 2087 - subjects.length)
    rest.forEach((c, i) => {
      subjects.push({ id: 80000 + i, object: 'kanji', data: { level: LEVEL + 1 + Math.floor((i * (60 - LEVEL)) / rest.length), characters: c } })
    })
    allKanji = { ...page(subjects), total_count: subjects.length }
    return allKanji
  }

  // --- routing ---
  const ROUTES = [
    [/\/user$/, () => ({ object: 'user', data: { username: 'tester', level: LEVEL } }), 'core'],
    [/\/summary$/, () => summary, 'core'],
    [/\/assignments\?started=true/, () => page(started), 'core'],
    [/\/assignments\?levels=\d+&subject_types=kanji/, () => page(kanjiAssignments), 'core'],
    [/\/subjects\?types=kanji&levels=/, () => page(kanjiSubjects), 'core'],
    [/\/subjects\?types=radical&levels=/, () => page(radicalSubjects), 'radicals'],
    [/\/assignments\?levels=\d+&subject_types=radical/, () => page(radicalAssignments), 'radicals'],
    [/\/level_progressions/, () => page(progressions), 'commentary'],
    [/\/review_statistics/, () => page(statistics), 'commentary'],
    [/\/spaced_repetition_systems/, () => page(systems), 'commentary'],
    [/\/assignments\?levels=\d+&hidden/, () => page([...kanjiAssignments, ...radicalAssignments]), 'commentary'],
    [/\/subjects\?ids=/, url => {
      const ids = new Set(new URL(url).searchParams.get('ids').split(',').map(Number))
      return page([...slippingSubjects, ...kanjiSubjects].filter(s => ids.has(s.id)))
    }, 'commentary'],
    [/\/subjects\?types=radical&hidden/, () => ({ total_count: 499, data: [] }), 'commentary'],
    // The totals read and coverage's read are the same URL: one page with
    // every kanji, and its total_count.
    [/\/subjects\?types=kanji&hidden/, everyKanji, 'commentary'],
    [/\/subjects\?types=vocabulary,kana_vocabulary&hidden/, () => ({ total_count: 6750, data: [] }), 'commentary']
  ]
  const DELAY = scenario === 'slow' ? { core: 1000, commentary: 2500, radicals: 1000 } : {}
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

  const real = window.fetch.bind(window)
  window.fetch = async (input, options) => {
    const url = String(input)
    if (!url.startsWith('https://api.wanikani.com/')) return real(input, options)
    // The app only ever reads. Shout if that stops being true.
    if (options?.method && options.method !== 'GET') console.error('[fake WaniKani] a write was attempted:', options.method, url)

    if (scenario === 'offline') throw new TypeError('Load failed')
    if (scenario === 'revoked') return new Response('{"error":"Unauthorized"}', { status: 401 })

    const route = ROUTES.find(([pattern]) => pattern.test(url))
    if (!route) {
      console.warn('[fake WaniKani] no fake for', url)
      return new Response('{"error":"Not found"}', { status: 404 })
    }
    const [, answer, kind] = route
    if (scenario === 'radicals-fail' && kind === 'radicals') throw new TypeError('Load failed')
    if (DELAY[kind]) await wait(DELAY[kind])
    return new Response(JSON.stringify(await answer(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
})()

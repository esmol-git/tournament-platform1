import type {
  CalendarRound,
  CalendarViewMode,
  MatchRow,
  TourSection,
  TournamentDetails,
} from '~/types/tournament-admin'

type TournamentGroup = TournamentDetails['groups'][number]

function playoffRoundDisplayRank(round?: MatchRow['playoffRound']) {
  switch (round) {
    case 'ROUND_OF_16':
      return 10
    case 'QUARTERFINAL':
      return 20
    case 'SEMIFINAL':
      return 30
    case 'THIRD_PLACE':
      return 40
    case 'FINAL':
      return 50
    default:
      return 0
  }
}

/** Группировка матчей по турам для режима «как тур» в календаре. */
export function buildTourSectionsFromMatches(matches: MatchRow[]): TourSection[] {
  const groups = new Map<string, MatchRow[]>()
  for (const m of matches) {
    const stage = m.stage ?? 'GROUP'
    const rn = m.roundNumber ?? 0
    const key = `${stage}:${rn}`
    const arr = groups.get(key) ?? []
    arr.push(m)
    groups.set(key, arr)
  }

  const sections: TourSection[] = []
  for (const [key, ms] of groups.entries()) {
    const [stage, rnStr] = key.split(':')
    const rn = Number(rnStr) || 0

    const times = ms
      .map((m) => new Date(m.startTime).getTime())
      .filter((x) => Number.isFinite(x))
    const minTime = times.length ? Math.min(...times) : null
    const dateLabel = minTime ? new Date(minTime).toLocaleDateString() : 'Дата не задана'

    let title = ''
    if (stage === 'GROUP') {
      title = `Тур ${rn || 1}`
    } else if (stage === 'PLAYOFF') {
      if (ms.some((m) => m.playoffRound === 'FINAL')) title = 'Плей-офф · Финал'
      else if (ms.some((m) => m.playoffRound === 'THIRD_PLACE')) title = 'Плей-офф · За 3 место'
      else {
        const matchesCount = ms.length
        if (matchesCount === 2) title = 'Плей-офф · Полуфинал'
        else if (matchesCount > 2) title = `Плей-офф · 1/${matchesCount} финала`
        else title = `Плей-офф · Раунд ${rn || 1}`
      }
    } else {
      title = `Тур ${rn || 1}`
    }

    sections.push({
      key,
      title,
      dateLabel,
      matches: ms.slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    })
  }

  return sections.sort((a, b) => {
    const ta = a.matches.length ? new Date(a.matches[0].startTime).getTime() : 0
    const tb = b.matches.length ? new Date(b.matches[0].startTime).getTime() : 0
    if (ta !== tb) return ta - tb

    const aSample = a.matches[0]
    const bSample = b.matches[0]
    const aStage = aSample?.stage ?? 'GROUP'
    const bStage = bSample?.stage ?? 'GROUP'
    if (aStage === 'PLAYOFF' && bStage === 'PLAYOFF') {
      const ar = playoffRoundDisplayRank(aSample?.playoffRound)
      const br = playoffRoundDisplayRank(bSample?.playoffRound)
      if (ar !== br) return ar - br
    }
    return a.key.localeCompare(b.key)
  })
}

export function resolvePlayoffTitleByVisibleMatches(ms: MatchRow[]): string {
  const hasFinal = ms.some((m) => m.playoffRound === 'FINAL')
  if (hasFinal) return 'Плей-офф · Финал'
  const hasThird = ms.some((m) => m.playoffRound === 'THIRD_PLACE')
  if (hasThird) return 'Плей-офф · За 3 место'

  const matchesCount = ms.length
  if (matchesCount === 2) return 'Плей-офф · Полуфинал'
  if (matchesCount > 2) return `Плей-офф · 1/${matchesCount} финала`
  return 'Плей-офф · Раунд'
}

export function getDisplayedRoundTitle(
  r: CalendarRound,
  opts: {
    calendarViewMode: CalendarViewMode
    calendarFiltersActive: boolean
  },
): string {
  if (opts.calendarViewMode !== 'grouped') return r.title
  if (!opts.calendarFiltersActive) return r.title
  if (!r.matches.length) return r.title
  const stage = r.matches[0].stage ?? 'UNKNOWN'
  if (stage !== 'PLAYOFF') return r.title
  return resolvePlayoffTitleByVisibleMatches(r.matches)
}

/** Раунды календаря по матчам (группы нужны для подписей группового этапа). */
export function buildCalendarRoundsFromMatches(
  items: MatchRow[],
  groups: TournamentGroup[],
): CalendarRound[] {
  const keyFor = (m: MatchRow) => {
    const d = new Date(m.startTime)
    const dateKey = Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10)
    const stage = m.stage ?? 'UNKNOWN'
    const rn = m.roundNumber ?? 0
    const g = m.groupId ?? ''
    const pr = m.playoffRound ?? ''
    return { dateKey, bucket: `${stage}:${rn}:${g}:${pr}` }
  }

  const byBucket = new Map<string, { dateKey: string; matches: MatchRow[] }>()
  for (const m of items) {
    const { dateKey, bucket } = keyFor(m)
    const cur = byBucket.get(bucket) ?? { dateKey, matches: [] as MatchRow[] }
    cur.matches.push(m)
    if (cur.dateKey === 'unknown' && dateKey !== 'unknown') cur.dateKey = dateKey
    byBucket.set(bucket, cur)
  }

  const playoffMatchesCountByRoundNumber = new Map<number, number>()
  for (const m of items) {
    const stage = m.stage ?? ''
    const rn = m.roundNumber
    if (stage === 'PLAYOFF' && typeof rn === 'number') {
      playoffMatchesCountByRoundNumber.set(rn, (playoffMatchesCountByRoundNumber.get(rn) ?? 0) + 1)
    }
  }

  const resolveTitle = (bucket: string) => {
    const [stage, rnStr, groupId, playoffRound] = bucket.split(':')
    const rn = Number(rnStr) || 0
    if (stage === 'GROUP') {
      const gName =
        groups.find((g) => g.id === groupId)?.name ?? (groupId ? 'Группа' : 'Группы')
      return `${gName} · Тур ${rn || 1}`
    }
    if (stage === 'PLAYOFF') {
      if (playoffRound === 'FINAL') return 'Плей-офф · Финал'
      if (playoffRound === 'THIRD_PLACE') return 'Плей-офф · За 3 место'
      const matchesCount = playoffMatchesCountByRoundNumber.get(rn) ?? 0
      if (matchesCount === 2) return 'Плей-офф · Полуфинал'
      if (matchesCount > 2) return `Плей-офф · 1/${matchesCount} финала`
      return `Плей-офф · Раунд ${rn || 1}`
    }
    return `Тур ${rn || 1}`
  }

  const buckets = [...byBucket.keys()].sort((a, b) => {
    const am = byBucket.get(a)!.matches
    const bm = byBucket.get(b)!.matches
    const aMin = am.reduce(
      (min, m) => Math.min(min, new Date(m.startTime).getTime()),
      Number.POSITIVE_INFINITY,
    )
    const bMin = bm.reduce(
      (min, m) => Math.min(min, new Date(m.startTime).getTime()),
      Number.POSITIVE_INFINITY,
    )
    if (aMin !== bMin) return aMin - bMin

    const [aStage, , , aPlayoffRound = ''] = a.split(':')
    const [bStage, , , bPlayoffRound = ''] = b.split(':')
    if (aStage === 'PLAYOFF' && bStage === 'PLAYOFF') {
      const ar = playoffRoundDisplayRank(aPlayoffRound as MatchRow['playoffRound'])
      const br = playoffRoundDisplayRank(bPlayoffRound as MatchRow['playoffRound'])
      if (ar !== br) return ar - br
    }
    return a.localeCompare(b)
  })

  return buckets.map((bucket, idx) => {
    const { dateKey, matches } = byBucket.get(bucket)!
    return {
      round: idx + 1,
      dateKey,
      dateLabel:
        dateKey === 'unknown'
          ? 'Дата не задана'
          : new Date(`${dateKey}T00:00:00`).toLocaleDateString(),
      title: resolveTitle(bucket),
      matches: matches.slice().sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    }
  })
}

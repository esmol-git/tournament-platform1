import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'

type TournamentRef = Ref<TournamentDetails | null> | ComputedRef<TournamentDetails | null>

const playoffSupportedFormats = [
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
]

/**
 * Подписи слотов плей-офф для таблицы матчей / протокола (как на странице турнира).
 */
export function usePlayoffSlotLabels(tournament: TournamentRef) {
  const matchNumberById = computed(() => {
    if (tournament.value?.matchNumberById) return tournament.value.matchNumberById

    const items = tournament.value?.matches ?? []
    const sorted = items
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
    const map: Record<string, number> = {}
    for (let i = 0; i < sorted.length; i++) {
      map[sorted[i].id] = i + 1
    }
    return map
  })

  const groupStageFinished = computed(() => {
    const ms = tournament.value?.matches ?? []
    const groupMatches = ms.filter((m) => m.stage === 'GROUP')
    if (!groupMatches.length) return false
    return groupMatches.every(
      (m) =>
        m.homeScore !== null &&
        m.awayScore !== null &&
        (m.status === 'PLAYED' || m.status === 'FINISHED'),
    )
  })

  const playoffQualifiersPerGroup = computed(() => tournament.value?.playoffQualifiersPerGroup ?? 2)

  const seedLabelByTeamId = computed(() => {
    const map = new Map<string, string>()
    const groups = (tournament.value?.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const teams = tournament.value?.tournamentTeams ?? []
    const k = playoffQualifiersPerGroup.value

    for (let gi = 0; gi < groups.length; gi++) {
      const groupId = groups[gi].id
      const letter = String.fromCharCode(65 + gi)
      const groupTeams = teams.filter((tt) => tt.group?.id === groupId).map((tt) => tt.teamId)
      for (let rank = 0; rank < k; rank++) {
        const teamId = groupTeams[rank]
        if (teamId) map.set(teamId, `${letter}${rank + 1}`)
      }
    }

    return map
  })

  const playoffFirstRoundNumber = computed<number | null>(() => {
    const ms = (tournament.value?.matches ?? []).filter(
      (m) => m.stage === 'PLAYOFF' && typeof m.roundNumber === 'number',
    )
    if (!ms.length) return null
    return Math.min(...ms.map((m) => m.roundNumber as number))
  })

  const playoffMatchesByRoundNumber = computed(() => {
    const map = new Map<number, MatchRow[]>()
    for (const m of tournament.value?.matches ?? []) {
      if (m.stage !== 'PLAYOFF') continue
      if (typeof m.roundNumber !== 'number') continue
      const rn = m.roundNumber as number
      const arr = map.get(rn) ?? []
      arr.push(m)
      map.set(rn, arr)
    }

    for (const [rn, arr] of map.entries()) {
      arr.sort((a, b) => {
        const at = new Date(a.startTime).getTime()
        const bt = new Date(b.startTime).getTime()
        return at - bt || a.id.localeCompare(b.id)
      })
      map.set(rn, arr)
    }
    return map
  })

  const matchHasResult = (m: MatchRow) =>
    m.homeScore !== null &&
    m.awayScore !== null &&
    (m.status === 'PLAYED' || m.status === 'FINISHED')

  const winnerName = (m: MatchRow) => {
    if (!matchHasResult(m)) return null
    const hs = m.homeScore as number
    const as = m.awayScore as number
    if (hs === as) return null
    return hs > as ? m.homeTeam.name : m.awayTeam.name
  }

  const loserName = (m: MatchRow) => {
    if (!matchHasResult(m)) return null
    const hs = m.homeScore as number
    const as = m.awayScore as number
    if (hs === as) return null
    return hs > as ? m.awayTeam.name : m.homeTeam.name
  }

  const playoffSlotLabels = (m: MatchRow) => {
    const fmt = tournament.value?.format ?? ''
    if (!playoffSupportedFormats.includes(fmt)) return null
    if (m.stage !== 'PLAYOFF') return null
    if (typeof m.roundNumber !== 'number') return null

    const firstRn = playoffFirstRoundNumber.value
    if (firstRn === null) return null

    if (m.roundNumber === firstRn) {
      if (groupStageFinished.value) return null
      const homeSeed = seedLabelByTeamId.value.get(m.homeTeam.id)
      const awaySeed = seedLabelByTeamId.value.get(m.awayTeam.id)
      if (!homeSeed || !awaySeed) return null
      return { home: homeSeed, away: awaySeed }
    }

    if (m.playoffRound === 'FINAL' || m.playoffRound === 'THIRD_PLACE') {
      const parentRn = m.roundNumber - 1
      const parentMatches = playoffMatchesByRoundNumber.value.get(parentRn) ?? []
      if (parentMatches.length < 2) return null
      const semi1 = parentMatches[0]
      const semi2 = parentMatches[1]

      const usesLoser = m.playoffRound === 'THIRD_PLACE'

      const homeTeam =
        (usesLoser ? loserName(semi1) : winnerName(semi1)) ??
        `${usesLoser ? 'Проигравший' : 'Победитель'} матча ${matchNumberById.value[semi1.id] ?? '—'}`
      const awayTeam =
        (usesLoser ? loserName(semi2) : winnerName(semi2)) ??
        `${usesLoser ? 'Проигравший' : 'Победитель'} матча ${matchNumberById.value[semi2.id] ?? '—'}`
      return { home: homeTeam, away: awayTeam }
    }

    const parentRn = m.roundNumber - 1
    const currentMatches = playoffMatchesByRoundNumber.value.get(m.roundNumber) ?? []
    const parentMatches = playoffMatchesByRoundNumber.value.get(parentRn) ?? []
    if (!currentMatches.length || parentMatches.length < 2) return null

    const idx = currentMatches.findIndex((x) => x.id === m.id)
    if (idx < 0) return null

    const leftParent = parentMatches[idx * 2]
    const rightParent = parentMatches[idx * 2 + 1]
    if (!leftParent || !rightParent) return null

    const homeTeam =
      winnerName(leftParent) ?? `Победитель матча ${matchNumberById.value[leftParent.id] ?? '—'}`
    const awayTeam =
      winnerName(rightParent) ?? `Победитель матча ${matchNumberById.value[rightParent.id] ?? '—'}`

    return { home: homeTeam, away: awayTeam }
  }

  return { playoffSlotLabels }
}

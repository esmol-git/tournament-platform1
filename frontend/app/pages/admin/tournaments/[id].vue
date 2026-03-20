<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  CalendarRound,
  CalendarViewMode,
  MatchEventRow,
  MatchRow,
  TableRow,
  TeamLite,
  TournamentDetails,
} from '~/types/tournament-admin'
import type { TeamPlayerRow } from '~/types/admin/team'
import { getApiErrorMessage } from '~/utils/apiError'
import { toYmdLocal } from '~/utils/dateYmd'
import {
  buildCalendarRoundsFromMatches,
  buildTourSectionsFromMatches,
  getDisplayedRoundTitle,
} from '~/utils/tournamentMatchCalendar'
import {
  dayLabels,
  eventTypeOptions,
  formatOptions,
  matchCountLabel,
  statusLabel,
  statusOptions,
  statusPillClass,
  teamSideOptions,
} from '~/utils/tournamentAdminUi'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import draggable from 'vuedraggable'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()

const tournamentId = computed(() => route.params.id as string)
const tenantId = useTenantId()

const loading = ref(false)
const tournament = ref<TournamentDetails | null>(null)

const tableLoading = ref(false)
const table = ref<TableRow[]>([])
const groupTables = ref<Record<string, TableRow[]>>({})

const calendarDialog = ref(false)
const calendarSaving = ref(false)

const activeTab = ref(0)

const qualificationRowStyle = (row: any) => {
  const k = playoffQualifiersPerGroup.value
  const pos = row?.position
  if (typeof pos !== 'number' || !k) return undefined

  if (pos < k) return { backgroundColor: 'rgba(34, 197, 94, 0.06)' }

  if (pos === k) {
    return {
      backgroundColor: 'rgba(34, 197, 94, 0.08)',
      // inset-схема работает над stripedRows и даёт линию на всю ширину строки
      boxShadow: 'inset 0 -2px 0 rgba(34, 197, 94, 1)',
    }
  }

  return undefined
}

const teamsLoading = ref(false)
const allTeams = ref<TeamLite[]>([])
const selectedTeamIds = ref<string[]>([])
const savingTeams = ref(false)
const groupA = ref<(TournamentDetails['tournamentTeams'][number])[]>([])
const groupB = ref<(TournamentDetails['tournamentTeams'][number])[]>([])
const groupingSaving = ref(false)
const preDragA = ref<string[]>([])
const preDragB = ref<string[]>([])

const calendarForm = reactive({
  startDate: null as Date | null,
  endDate: null as Date | null,
  format: 'SINGLE_GROUP',
  templateId: '' as '' | 'kids_mini_8',
  useTemplate: false,
  intervalDays: 7,
  roundsPerDay: 1,
  allowedDays: [] as number[],
  matchDurationMinutes: 50,
  matchBreakMinutes: 10,
  simultaneousMatches: 1,
  dayStartTimeDefault: '12:00',
  dayStartTimeOverrides: {} as Record<number, string>,
  replaceExisting: true,
})

const calendarRounds = ref<CalendarRound[]>([])

const calendarViewMode = ref<CalendarViewMode>('grouped')

// Диапазон дат для фильтра календаря.
// В PrimeVue DatePicker при selectionMode="range" обычно приходит массив [start, end].
const calendarFilterDateRange = ref<Date[] | null>(null)
const calendarFilterStatuses = ref<string[]>([])
const calendarFilterTeamIds = ref<string[]>([])

const expandedTourKeys = ref<Record<string, boolean>>({})

const calendarFiltersActive = computed(() => {
  return (
    calendarFilterStatuses.value.length > 0 ||
    calendarFilterTeamIds.value.length > 0 ||
    !!calendarFilterDateRange.value?.length
  )
})

const resetCalendarFilters = () => {
  calendarFilterDateRange.value = null
  calendarFilterStatuses.value = []
  calendarFilterTeamIds.value = []
  expandedTourKeys.value = {}
  fetchTournament()
}

// Фильтрация теперь полностью на бэкенде: фронт только отображает то, что вернул сервер.
const filteredMatches = computed(() => tournament.value?.matches ?? [])

const visibleCalendarRounds = computed(() => {
  return calendarRounds.value
    .map((r) => ({
      ...r,
      matches: r.matches,
    }))
    .filter((r) => r.matches.length > 0)
})

const toggleTour = (key: string) => {
  expandedTourKeys.value[key] = !expandedTourKeys.value[key]
}

const visibleTourSections = computed(() => buildTourSectionsFromMatches(filteredMatches.value))

const displayedRoundTitle = (r: CalendarRound) =>
  getDisplayedRoundTitle(r, {
    calendarViewMode: calendarViewMode.value,
    calendarFiltersActive: calendarFiltersActive.value,
  })

const matchNumberById = computed(() => {
  if (tournament.value?.matchNumberById) return tournament.value.matchNumberById

  // Fallback: compute from current matches (can shift when server-side filters are applied).
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

const reordering = ref<string | null>(null)
const saveRoundOrder = async (r: CalendarRound) => {
  if (!token.value) return
  if (!tournament.value) return
  if (r.dateKey === 'unknown') return
  if (tournament.value.format !== 'SINGLE_GROUP') return

  const matchIds = (r.matches ?? []).map((m) => m.id)
  if (!matchIds.length) return

  reordering.value = r.dateKey
  try {
    await authFetch(
      apiUrl(`/tournaments/${tournamentId.value}/rounds/${r.dateKey}/reorder`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { matchIds },
      },
    )
    toast.add({
      severity: 'success',
      summary: 'Порядок матчей обновлён',
      detail: 'Время матчей пересчитано по слотам.',
      life: 2500,
    })
    await fetchTournament()
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось изменить порядок',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
    // откатим порядок из сервера
    await fetchTournament()
  } finally {
    reordering.value = null
  }
}

const protocolOpen = ref(false)
const protocolSaving = ref(false)
const protocolMatch = ref<MatchRow | null>(null)

const protocolPlayersLoading = ref(false)
const protocolHomePlayers = ref<TeamPlayerRow[]>([])
const protocolAwayPlayers = ref<TeamPlayerRow[]>([])

const protocolHomePlayerOptions = computed(() =>
  protocolHomePlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)
const protocolAwayPlayerOptions = computed(() =>
  protocolAwayPlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)

const protocolForm = reactive({
  startTime: null as Date | null,
  homeScore: 0,
  awayScore: 0,
  status: 'PLAYED',
  events: [] as {
    type: string
    minute: number | null
    playerId: string
    teamSide: 'HOME' | 'AWAY' | null
  }[],
})

const openProtocol = async (m: MatchRow) => {
  protocolMatch.value = m
  protocolForm.startTime = m.startTime ? new Date(m.startTime) : null
  protocolForm.homeScore = (m.homeScore ?? 0) as number
  protocolForm.awayScore = (m.awayScore ?? 0) as number
  protocolForm.status = (m.status ?? 'PLAYED') as string
  protocolForm.events = (m.events ?? []).map((e: MatchEventRow) => ({
    type: e.type,
    minute: (e.minute ?? null) as number | null,
    playerId: (e.playerId ?? '') as string,
    teamSide: (e.teamSide ?? null) as 'HOME' | 'AWAY' | null,
  }))
  protocolOpen.value = true

  // Load roster players for both teams so "playerId" can be selected safely.
  protocolPlayersLoading.value = true
  try {
    const [home, away] = await Promise.all([
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.homeTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.awayTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
    ])
    protocolHomePlayers.value = home.items
    protocolAwayPlayers.value = away.items
  } catch {
    protocolHomePlayers.value = []
    protocolAwayPlayers.value = []
  } finally {
    protocolPlayersLoading.value = false
  }
}

const addEvent = () => {
  protocolForm.events.push({
    type: 'GOAL',
    minute: null,
    playerId: '',
    teamSide: 'HOME',
  })
}

const removeEvent = (idx: number) => {
  protocolForm.events.splice(idx, 1)
}

const saveProtocol = async () => {
  if (!token.value || !protocolMatch.value) return
  protocolSaving.value = true
  try {
    const desiredStartTime = protocolForm.startTime instanceof Date ? protocolForm.startTime : null
    const currentStartTime = protocolMatch.value.startTime ? new Date(protocolMatch.value.startTime) : null
    if (
      desiredStartTime &&
      (!currentStartTime || desiredStartTime.getTime() !== currentStartTime.getTime())
    ) {
      await authFetch(
        apiUrl(`/tournaments/${tournamentId.value}/matches/${protocolMatch.value.id}`),
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body: { startTime: desiredStartTime.toISOString() },
        },
      )
    }

    await authFetch(
      apiUrl(`/tournaments/${tournamentId.value}/matches/${protocolMatch.value.id}/protocol`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          homeScore: protocolForm.homeScore,
          awayScore: protocolForm.awayScore,
          status: protocolForm.status,
          events: protocolForm.events.map((e) => ({
            type: e.type,
            minute: e.minute ?? undefined,
            playerId: e.playerId || undefined,
            teamSide: e.teamSide ?? undefined,
          })),
        },
      },
    )
    protocolOpen.value = false
    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: 'Протокол сохранён',
      detail: 'Результат матча обновлён, таблица пересчитана.',
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить протокол',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    protocolSaving.value = false
  }
}

const finishProtocol = async () => {
  if (protocolForm.status !== 'FINISHED') protocolForm.status = 'FINISHED'
  await saveProtocol()
}

const fetchTournament = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const params = new URLSearchParams()
    const range = calendarFilterDateRange.value
    if (range?.[0]) params.set('dateFrom', toYmdLocal(new Date(range[0])))
    if (range?.[1]) params.set('dateTo', toYmdLocal(new Date(range[1])))
    if (calendarFilterStatuses.value.length) params.set('statuses', calendarFilterStatuses.value.join(','))
    if (calendarFilterTeamIds.value.length) params.set('teamIds', calendarFilterTeamIds.value.join(','))

    const qs = params.toString()
    const url = qs
      ? apiUrl(`/tournaments/${tournamentId.value}?${qs}`)
      : apiUrl(`/tournaments/${tournamentId.value}`)

    const res = await authFetch<TournamentDetails>(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    tournament.value = res
    calendarRounds.value = buildCalendarRoundsFromMatches(res.matches ?? [], res.groups ?? [])

    calendarForm.intervalDays = res.intervalDays ?? 7
    calendarForm.allowedDays = Array.isArray(res.allowedDays) ? res.allowedDays : []
    calendarForm.startDate = res.startsAt ? new Date(res.startsAt) : null
    calendarForm.endDate = res.endsAt ? new Date(res.endsAt) : null
    calendarForm.format = (res.format ?? 'SINGLE_GROUP') as string
    calendarForm.matchDurationMinutes = res.matchDurationMinutes ?? 50
    calendarForm.matchBreakMinutes = res.matchBreakMinutes ?? 10
    calendarForm.simultaneousMatches = res.simultaneousMatches ?? 1
    calendarForm.dayStartTimeDefault = (res.dayStartTimeDefault ?? '12:00') as string
    calendarForm.dayStartTimeOverrides = {}
    const overrides = res.dayStartTimeOverrides ?? {}
    if (overrides && typeof overrides === 'object') {
      for (const [k, v] of Object.entries(overrides as any)) {
        const day = Number(k)
        if (Number.isInteger(day) && day >= 0 && day <= 6 && typeof v === 'string') {
          calendarForm.dayStartTimeOverrides[day] = v
        }
      }
    }

    selectedTeamIds.value = Array.isArray(res.tournamentTeams)
      ? res.tournamentTeams.map((x) => x.teamId)
      : []

    // Init grouping UI: show current group assignment.
    if (['GROUPS_PLUS_PLAYOFF', 'GROUPS_2', 'GROUPS_3', 'GROUPS_4'].includes(res.format)) {
      const tts = (res.tournamentTeams ?? []).slice()
      const orderedTeamGroupIds: string[] = []
      for (const tt of tts) {
        const gid = tt.group?.id
        if (!gid) continue
        if (!orderedTeamGroupIds.includes(gid)) orderedTeamGroupIds.push(gid)
      }

      const aId =
        orderedTeamGroupIds[0] ??
        (res.groups ?? []).find((g) => g.name === 'Группа A')?.id ??
        (res.groups ?? [])[0]?.id
      const bId =
        orderedTeamGroupIds[1] ??
        (res.groups ?? []).find((g) => g.name === 'Группа B')?.id ??
        (res.groups ?? [])[1]?.id

      const a: typeof tts = []
      const b: typeof tts = []
      for (const tt of tts) {
        if (tt.group?.id && aId && tt.group.id === aId) a.push(tt)
        else if (tt.group?.id && bId && tt.group.id === bId) b.push(tt)
      }
      // if not assigned yet, split by order from backend (createdAt asc)
      if (a.length + b.length !== tts.length) {
        a.splice(0, a.length, ...tts.filter((_, i) => i % 2 === 0))
        b.splice(0, b.length, ...tts.filter((_, i) => i % 2 === 1))
      }
      groupA.value = a
      groupB.value = b
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось применить фильтры',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    loading.value = false
  }
}

let filtersFetchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [calendarFilterDateRange, calendarFilterStatuses, calendarFilterTeamIds],
  () => {
    if (!token.value) return
    if (filtersFetchTimer) clearTimeout(filtersFetchTimer)
    filtersFetchTimer = setTimeout(() => {
      fetchTournament()
    }, 350)
  },
  { deep: true },
)

const applyCalendarFilters = async () => {
  await fetchTournament()
}

const isGroupedFormat = computed(() =>
  ['GROUPS_PLUS_PLAYOFF', 'GROUPS_2', 'GROUPS_3', 'GROUPS_4'].includes(tournament.value?.format ?? ''),
)
const hasAnyEnteredResults = computed(() => {
  const ms = tournament.value?.matches ?? []
  return ms.some((m) => m.homeScore !== null && m.awayScore !== null && (m.status === 'PLAYED' || m.status === 'FINISHED'))
})

const canEditTournament = computed(() => tournament.value?.status === 'DRAFT')

// Группы можно менять, пока в расписании нет введённых результатов.
// После ввода хотя бы одного счёта правки групп могут сломать календарь и таблицы.
const canEditGroups = computed(() => isGroupedFormat.value && canEditTournament.value && !hasAnyEnteredResults.value)

const canEditTeams = computed(() => canEditTournament.value && !hasAnyEnteredResults.value)

// Если календарь уже сгенерирован (есть матчи), то при правках состава/групп
// нужно пересоздавать расписание, иначе матчи будут соответствовать старой структуре.
const shouldRegenerateCalendar = computed(
  () => (tournament.value?.matches?.length ?? 0) > 0 && !hasAnyEnteredResults.value,
)

const teamCount = computed(() => tournament.value?.tournamentTeams?.length ?? 0)

const canRegenerateCalendar = computed(() => {
  const minTeams = tournament.value?.minTeams ?? 0
  return shouldRegenerateCalendar.value && teamCount.value >= minTeams
})

const ratingSaving = ref(false)
const ratingOptions = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))

const updateTeamRating = async (teamId: string, rating: number) => {
  if (!token.value) return
  if (!tournament.value) return
  if (!canEditTeams.value) return
  if (ratingSaving.value) return

  ratingSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}/rating`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { rating: Number(rating) },
    })

    if (canRegenerateCalendar.value) {
      await generateCalendar()
      await fetchTournament()
      await fetchTable()
    } else {
      await fetchTournament()
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить рейтинг',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
    // Синхронизируем состояние с сервером после ошибки.
    await fetchTournament()
  } finally {
    ratingSaving.value = false
  }
}

const expectedGroupCount = computed(() => {
  const f = tournament.value?.format
  if (f === 'GROUPS_2') return 2
  if (f === 'GROUPS_3') return 3
  if (f === 'GROUPS_4') return 4
  if (f === 'GROUPS_PLUS_PLAYOFF') return 2
  return tournament.value?.groupCount ?? 1
})

const expectedGroupSize = computed(() => {
  const total = tournament.value?.tournamentTeams?.length ?? 0
  const gc = expectedGroupCount.value
  if (!gc || gc < 1) return null
  if (total === 0) return null
  if (total % gc !== 0) return null
  return total / gc
})

// Восстановление "первой/второй" группы по фактическим assignment'ам команд.
// Иногда `tournament.groups` может быть неполным, а `tournamentTeams[].group` приходит корректно.
const teamGroupIdsOrdered = computed(() => {
  const ids: string[] = []
  const tts = tournament.value?.tournamentTeams ?? []
  for (const tt of tts) {
    const gid = tt.group?.id
    if (!gid) continue
    if (!ids.includes(gid)) ids.push(gid)
  }
  return ids
})

const groupIdA = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа A')?.id ?? teamGroupIdsOrdered.value[0] ?? gs[0]?.id ?? null
})
const groupIdB = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа B')?.id ?? teamGroupIdsOrdered.value[1] ?? gs[1]?.id ?? null
})

const groupIdC = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа C')?.id ?? gs[2]?.id ?? null
})

const groupIdD = computed(() => {
  const gs = tournament.value?.groups ?? []
  return gs.find((g) => g.name === 'Группа D')?.id ?? gs[3]?.id ?? null
})

const groupTeamIdsA = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdA.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)
const groupTeamIdsB = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdB.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

const groupTeamIdsC = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdC.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

const groupTeamIdsD = computed(() =>
  (tournament.value?.tournamentTeams ?? [])
    .filter((tt) => tt.group?.id === groupIdD.value)
    .map((tt) => tt.teamId)
    .slice(0, 2),
)

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

const playoffSupportedFormats = [
  'GROUPS_PLUS_PLAYOFF',
  'GROUPS_2',
  'GROUPS_3',
  'GROUPS_4',
]

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

  // Stable ordering is required to map (idx*2 .. idx*2+1) between rounds.
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

  // First knockout round: show seeds (A1/B2/...) until group stage is finished.
  if (m.roundNumber === firstRn) {
    if (groupStageFinished.value) return null
    const homeSeed = seedLabelByTeamId.value.get(m.homeTeam.id)
    const awaySeed = seedLabelByTeamId.value.get(m.awayTeam.id)
    if (!homeSeed || !awaySeed) return null
    return { home: homeSeed, away: awaySeed }
  }

  // FINAL / THIRD_PLACE depend only on the 2 "semi-final" matches of the previous round.
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

  // Later knockout rounds: show winners/losers of the previous round matches (binary-tree mapping).
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
    winnerName(leftParent) ??
    `Победитель матча ${matchNumberById.value[leftParent.id] ?? '—'}`
  const awayTeam =
    winnerName(rightParent) ??
    `Победитель матча ${matchNumberById.value[rightParent.id] ?? '—'}`

  return { home: homeTeam, away: awayTeam }
}

const saveTeamGroup = async (teamId: string, groupId: string | null) => {
  if (!token.value) return
  groupingSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}/group`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { groupId },
    })
  } finally {
    groupingSaving.value = false
  }
}

const checkGroupMove = (evt: any) => {
  if (!canEditGroups.value || groupingSaving.value) return false
  return true
}

const onGroupChange = async (evt: any, targetGroupId: string | null) => {
  if (!canEditGroups.value || !tournament.value) return
  if (!targetGroupId) return
  const moved = (evt?.added?.element ?? evt?.moved?.element) as any | undefined
  if (!moved) return
  const newIndex = (evt?.added?.newIndex ?? evt?.moved?.newIndex) as number | undefined
  const size = expectedGroupSize.value

  // If target overflowed, perform a swap by moving one item back to the source.
  let swapped: any | null = null
  if (size && (groupA.value.length > size || groupB.value.length > size)) {
    const isTargetA = targetGroupId === groupIdA.value
    const targetList = isTargetA ? groupA.value : groupB.value
    const sourceList = isTargetA ? groupB.value : groupA.value
    const preTarget = isTargetA ? preDragA.value : preDragB.value
    const preSource = isTargetA ? preDragB.value : preDragA.value

    const swapOutId =
      typeof newIndex === 'number' && newIndex >= 0 && newIndex < preTarget.length
        ? preTarget[newIndex]
        : null

    const pickSwapOut = () => {
      if (swapOutId && swapOutId !== moved.teamId) {
        const found = targetList.find((x: any) => x.teamId === swapOutId)
        if (found) return found
      }
      for (let i = targetList.length - 1; i >= 0; i--) {
        if (targetList[i].teamId !== moved.teamId) return targetList[i]
      }
      return null
    }

    swapped = pickSwapOut()
    if (swapped) {
      const idx = targetList.findIndex((x: any) => x.teamId === swapped.teamId)
      if (idx >= 0) targetList.splice(idx, 1)

      const desiredIndex = preSource.indexOf(moved.teamId)
      const insertAt = desiredIndex >= 0 ? Math.min(desiredIndex, sourceList.length) : sourceList.length
      sourceList.splice(insertAt, 0, swapped)
    }
  }
  try {
    const ops: Promise<any>[] = [saveTeamGroup(moved.teamId, targetGroupId)]
    if (swapped) {
      const otherGroupId = targetGroupId === groupIdA.value ? groupIdB.value : groupIdA.value
      if (otherGroupId) ops.push(saveTeamGroup(swapped.teamId, otherGroupId))
    }
    await Promise.all(ops)
    await fetchTournament()

    if (canRegenerateCalendar.value) {
      // Пересоздаём календарь, чтобы расписание матчей соответствовало новым группам.
      await generateCalendar()
      await fetchTournament()
      await fetchTable()
      toast.add({
        severity: 'success',
        summary: 'Группы обновлены',
        detail: 'Календарь пересоздан с новым распределением.',
        life: 2000,
      })
    } else {
      toast.add({
        severity: 'success',
        summary: 'Группы обновлены',
        detail:
          swapped ? 'Команды поменялись местами.' : 'Команда перемещена.' + (teamCount.value < (tournament.value?.minTeams ?? 0) ? ' Календарь не пересоздан: недостаточно команд.' : ''),
        life: 1500,
      })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Не удалось сохранить группы', detail: getApiErrorMessage(e, 'Ошибка запроса'), life: 6000 })
    await fetchTournament()
  }
}

const fetchAllTeams = async () => {
  if (!token.value) return
  teamsLoading.value = true
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: { page: 1, pageSize: 200 },
      },
    )
    allTeams.value = res.items
  } finally {
    teamsLoading.value = false
  }
}

const saveTeams = async () => {
  if (!token.value || !tournament.value) return
  savingTeams.value = true
  if (!canEditTeams.value) {
    toast.add({
      severity: 'error',
      summary: 'Редактирование запрещено',
      detail: 'Изменения доступны только для черновика и только до ввода результатов.',
      life: 6000,
    })
    savingTeams.value = false
    return
  }
  const wasGenerated = (tournament.value.matches?.length ?? 0) > 0
  const canEditAfterGeneration = !hasAnyEnteredResults.value
  try {
    if (wasGenerated && !canEditAfterGeneration) {
      toast.add({
        severity: 'error',
        summary: 'Нельзя менять состав после ввода результатов',
        detail: 'Изменение команд после внесения счётов ломает календарь. Сначала очистите результаты или пересоздайте календарь.',
        life: 6000,
      })
      return
    }

    const prev = new Set<string>(
      Array.isArray(tournament.value.tournamentTeams)
        ? tournament.value.tournamentTeams.map((x) => x.teamId)
        : [],
    )
    const next = new Set<string>(selectedTeamIds.value)
    const toAdd = [...next].filter((id) => !prev.has(id))
    const toRemove = [...prev].filter((id) => !next.has(id))

    for (const teamId of toAdd) {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
      })
    }
    for (const teamId of toRemove) {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/teams/${teamId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      })
    }

    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: 'Команды обновлены',
      detail: 'Состав турнира сохранён.',
      life: 2500,
    })

    if (canRegenerateCalendar.value) {
      await generateCalendar()
      await fetchTournament()
      await fetchTable()
    }
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить команды',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    savingTeams.value = false
  }
}

const fetchTable = async () => {
  if (!token.value) return
  tableLoading.value = true
  try {
    if (isGroupedFormat.value && Array.isArray(tournament.value.groups)) {
      const next: Record<string, TableRow[]> = {}
      for (const g of tournament.value.groups.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
        const res = await authFetch<TableRow[]>(
          apiUrl(`/tournaments/${tournamentId.value}/table`),
          {
            params: { groupId: g.id },
            headers: { Authorization: `Bearer ${token.value}` },
          },
        )
        next[g.id] = res
      }
      groupTables.value = next
      table.value = []
    } else {
      const res = await authFetch<TableRow[]>(apiUrl(`/tournaments/${tournamentId.value}/table`), {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      table.value = res
      groupTables.value = {}
    }
  } finally {
    tableLoading.value = false
  }
}

const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined)

const normalizeDateInput = (v: unknown) => {
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return undefined
}

const isValidTimeHHmm = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

const generateCalendar = async () => {
  if (!token.value) return
  calendarSaving.value = true
  try {
    const templateEnabled =
      calendarForm.useTemplate && calendarForm.templateId === 'kids_mini_8'

    if (calendarForm.startDate && calendarForm.endDate && calendarForm.startDate >= calendarForm.endDate) {
      throw new Error('Дата окончания должна быть позже даты старта')
    }
    if (!isValidTimeHHmm(calendarForm.dayStartTimeDefault)) {
      throw new Error('Время начала дня должно быть в формате HH:mm')
    }
    for (const [k, v] of Object.entries(calendarForm.dayStartTimeOverrides ?? {})) {
      if (!isValidTimeHHmm(v)) {
        const day = Number(k)
        throw new Error(`Неверное время старта для ${dayLabels[day] ?? k}. Формат HH:mm`)
      }
    }

    // Important: calendar generator should not change tournament.format here.
    // Format is edited in the tournament edit dialog.
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        startsAt: normalizeDateInput(calendarForm.startDate) ?? null,
        endsAt: normalizeDateInput(calendarForm.endDate) ?? null,
        ...(templateEnabled
          ? {}
          : {
              intervalDays: calendarForm.intervalDays || undefined,
              allowedDays: Array.isArray(calendarForm.allowedDays) ? calendarForm.allowedDays : [],
              roundsPerDay: calendarForm.roundsPerDay || undefined, // ignored by backend update; kept for future
            }),
        matchDurationMinutes: calendarForm.matchDurationMinutes || undefined,
        matchBreakMinutes: calendarForm.matchBreakMinutes ?? 0,
        simultaneousMatches: calendarForm.simultaneousMatches || undefined,
        dayStartTimeDefault: calendarForm.dayStartTimeDefault || undefined,
        dayStartTimeOverrides: calendarForm.dayStartTimeOverrides ?? {},
      },
    })

    if (templateEnabled) {
      const res = await authFetch<any>(apiUrl(`/tournaments/${tournamentId.value}/calendar/from-template`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          templateId: calendarForm.templateId,
          startDate: normalizeDateInput(calendarForm.startDate),
          parallelMatches: calendarForm.simultaneousMatches || undefined,
          replaceExisting: calendarForm.replaceExisting,
        },
      })
      if (res?.playoff?.skipped) {
        toast.add({
          severity: 'info',
          summary: 'Группы созданы',
          detail: 'Плей-офф будет доступен после ввода результатов групп.',
          life: 4500,
        })
      }
    } else {
      await authFetch(apiUrl(`/tournaments/${tournamentId.value}/calendar`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          // можно не передавать параметры — backend возьмёт startsAt/intervalDays/allowedDays из турнира
          startDate: normalizeDateInput(calendarForm.startDate),
          intervalDays: calendarForm.intervalDays || undefined,
          roundsPerDay: calendarForm.roundsPerDay || undefined,
          allowedDays: calendarForm.allowedDays?.length ? calendarForm.allowedDays : undefined,
          replaceExisting: calendarForm.replaceExisting,
          matchDurationMinutes: calendarForm.matchDurationMinutes || undefined,
          matchBreakMinutes: calendarForm.matchBreakMinutes ?? undefined,
          simultaneousMatches: calendarForm.simultaneousMatches || undefined,
          dayStartTimeDefault: calendarForm.dayStartTimeDefault || undefined,
          dayStartTimeOverrides: calendarForm.dayStartTimeOverrides ?? undefined,
        },
      })
    }
    calendarDialog.value = false
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: 'Календарь создан',
      detail: templateEnabled ? 'Сгенерировано по шаблону.' : 'Расписание сгенерировано.',
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сгенерировать календарь',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

const clearCalendar = async () => {
  if (!token.value) return
  calendarSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/calendar`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTournament()
    await fetchTable()
    toast.add({
      severity: 'success',
      summary: 'Календарь очищен',
      detail: 'Все матчи турнира удалены.',
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось очистить календарь',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

const generatePlayoff = async () => {
  if (!token.value) return
  calendarSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${tournamentId.value}/playoff`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchTournament()
    toast.add({
      severity: 'success',
      summary: 'Плей-офф создан',
      detail: 'Полуфиналы/финал/за 3 место добавлены.',
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось создать плей-офф',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    calendarSaving.value = false
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  await fetchTournament()
  await fetchAllTeams()
  await fetchTable()
})
</script>

<template>
  <section class="p-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <Button
          label="Назад"
          icon="pi pi-arrow-left"
          text
          class="mb-2"
          @click="router.push('/admin/tournaments')"
        />
        <h1 class="text-2xl font-semibold text-surface-900">
          {{ tournament?.name ?? 'Турнир' }}
        </h1>
        <p class="mt-1 text-sm text-muted-color">/{{ tournament?.slug }}</p>
      </div>

      <div class="flex gap-2">
        <Button
          label="Сгенерировать календарь"
          icon="pi pi-calendar-plus"
          severity="secondary"
          :disabled="!tournament"
          @click="calendarDialog = true"
        />
        <Button
          label="Обновить таблицу"
          icon="pi pi-refresh"
          :loading="tableLoading"
          severity="secondary"
          @click="fetchTable"
        />
      </div>
    </div>

    <TabView :activeIndex="activeTab" @update:activeIndex="(v) => (activeTab = v)">
      <TabPanel header="Календарь">
        <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-surface-900">Турнирные туры</h2>
              <p class="mt-1 text-xs text-muted-color">
                Нажми на матч, чтобы ввести протокол (счёт и события).
              </p>
            </div>
            <Button
              label="Сгенерировать"
              icon="pi pi-calendar-plus"
              severity="secondary"
              :disabled="!tournament"
              @click="calendarDialog = true"
            />
          </div>

          <div class="mt-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Button
                  label="Как сейчас"
                  severity="secondary"
                  :text="calendarViewMode !== 'grouped'"
                  @click="calendarViewMode = 'grouped'"
                />
                <Button
                  label="По турам"
                  severity="secondary"
                  :text="calendarViewMode !== 'tour'"
                  @click="calendarViewMode = 'tour'"
                />
              </div>
              <div class="flex items-center gap-2">
                <Button
                  label="Сбросить фильтры"
                  text
                  :disabled="!calendarFiltersActive"
                  @click="resetCalendarFilters"
                />
                <Button
                  label="Применить"
                  icon="pi pi-filter"
                  severity="secondary"
                  :disabled="!calendarFiltersActive || !tournament"
                  @click="applyCalendarFilters"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div class="md:col-span-6">
                <label class="text-sm block mb-1">Диапазон дат</label>
                <DatePicker
                  v-model="calendarFilterDateRange"
                  class="w-full"
                  dateFormat="yy-mm-dd"
                  showIcon
                  selectionMode="range"
                />
              </div>
              <div class="md:col-span-3">
                <label class="text-sm block mb-1">Статус</label>
                <MultiSelect
                  v-model="calendarFilterStatuses"
                  :options="statusOptions"
                  option-label="label"
                  option-value="value"
                  :maxSelectedLabels="0"
                  selectedItemsLabel="Выбрано: {0}"
                  class="w-full"
                  placeholder="Любые"
                  :showToggleAll="false"
                  filter
                />
              </div>
              <div class="md:col-span-3">
                <label class="text-sm block mb-1">Команда</label>
                <MultiSelect
                  v-model="calendarFilterTeamIds"
                  :options="allTeams"
                  option-label="name"
                  option-value="id"
                  :maxSelectedLabels="0"
                  selectedItemsLabel="Выбрано: {0}"
                  class="w-full"
                  :loading="teamsLoading"
                  placeholder="Все команды"
                  :showToggleAll="false"
                  filter
                />
              </div>
            </div>

            <div v-if="calendarViewMode === 'grouped'">
              <div v-if="!visibleCalendarRounds.length" class="text-sm text-muted-color">
                Пока нет матчей (с учётом фильтров).
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="r in visibleCalendarRounds"
                  :key="r.dateKey"
                  class="rounded-lg border border-surface-200"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-50">
                    <div class="text-sm font-medium">
                  {{ displayedRoundTitle(r) }} <span class="text-muted-color">({{ r.dateLabel }})</span>
                      <span
                        v-if="tournament?.format === 'SINGLE_GROUP'"
                        class="ml-2 text-xs font-normal text-muted-color"
                      >
                        Перетащи строку, чтобы поменять порядок
                      </span>
                    </div>
                    <div class="text-xs text-muted-color flex items-center gap-2">
                      <span v-if="reordering === r.dateKey" class="inline-flex items-center gap-1">
                        <span class="pi pi-spin pi-spinner" />
                        Сохраняю…
                      </span>
                      <span v-else>{{ r.matches.length }} {{ matchCountLabel(r.matches.length) }}</span>
                    </div>
                  </div>
                  <draggable
                    :list="r.matches"
                    item-key="id"
                    handle=".drag-handle"
                    :disabled="
                      !tournament ||
                      tournament.format !== 'SINGLE_GROUP' ||
                      reordering === r.dateKey ||
                      calendarFiltersActive
                    "
                    class="divide-y divide-surface-200"
                    @end="saveRoundOrder(r)"
                  >
                    <template #item="{ element: m }">
                      <div class="flex items-stretch gap-2 px-3 py-2 hover:bg-surface-50 transition-colors">
                        <button
                          type="button"
                          class="drag-handle flex items-center justify-center w-10 text-muted-color hover:text-surface-900 cursor-grab active:cursor-grabbing"
                          :title="tournament?.format === 'SINGLE_GROUP' ? 'Перетащить' : 'Недоступно для формата'"
                        >
                          <div class="flex items-center gap-2">
                            <span class="pi pi-bars text-sm" />
                            <span class="text-xs tabular-nums text-surface-500">
                              {{ matchNumberById[m.id] ?? '—' }}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          class="flex-1 text-left"
                          @click="openProtocol(m)"
                        >
                          <div class="flex items-center justify-between gap-3">
                            <div class="text-sm">
                              <span class="font-medium">
                                {{ playoffSlotLabels(m)?.home ?? m.homeTeam.name }}
                              </span>
                              <span class="text-muted-color mx-1">
                                {{ playoffSlotLabels(m) ? '-' : 'vs' }}
                              </span>
                              <span class="font-medium">
                                {{ playoffSlotLabels(m)?.away ?? m.awayTeam.name }}
                              </span>
                            </div>
                            <div class="text-sm tabular-nums">
                              <span v-if="m.homeScore !== null && m.awayScore !== null">
                                {{ m.homeScore }}:{{ m.awayScore }}
                              </span>
                              <span v-else class="text-muted-color">—</span>
                            </div>
                          </div>
                          <div class="mt-1 text-xs text-muted-color">
                            {{ new Date(m.startTime).toLocaleString() }} ·
                            <span :class="statusPillClass(m.status)">{{ statusLabel(m.status) }}</span>
                          </div>
                        </button>
                      </div>
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <div v-else>
              <div v-if="!visibleTourSections.length" class="text-sm text-muted-color">
                Пока нет матчей (с учётом фильтров).
              </div>

              <div v-else class="space-y-4">
                <div
                  v-for="t in visibleTourSections"
                  :key="t.key"
                  class="rounded-lg border border-surface-200"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-surface-50">
                    <div class="text-sm font-medium">
                      {{ t.title }} <span class="text-muted-color">({{ t.dateLabel }})</span>
                    </div>
                    <div class="text-xs text-muted-color flex items-center gap-2">
                      <Button
                        :icon="expandedTourKeys[t.key] ? 'pi pi-angle-up' : 'pi pi-angle-down'"
                        text
                        severity="secondary"
                        size="small"
                        @click="toggleTour(t.key)"
                      />
                      <span>{{ t.matches.length }} {{ matchCountLabel(t.matches.length) }}</span>
                    </div>
                  </div>

                  <div v-if="expandedTourKeys[t.key]" class="divide-y divide-surface-200">
                    <div
                      v-for="m in t.matches"
                      :key="m.id"
                      class="flex items-stretch gap-2 px-3 py-2 hover:bg-surface-50 transition-colors"
                    >
                      <button
                        type="button"
                        class="flex-1 text-left"
                        @click="openProtocol(m)"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <div class="text-sm">
                            <span class="font-medium">
                              {{ playoffSlotLabels(m)?.home ?? m.homeTeam.name }}
                            </span>
                            <span class="text-muted-color mx-1">
                              {{ playoffSlotLabels(m) ? '-' : 'vs' }}
                            </span>
                            <span class="font-medium">
                              {{ playoffSlotLabels(m)?.away ?? m.awayTeam.name }}
                            </span>
                          </div>
                          <div class="text-sm tabular-nums">
                            <span v-if="m.homeScore !== null && m.awayScore !== null">
                              {{ m.homeScore }}:{{ m.awayScore }}
                            </span>
                            <span v-else class="text-muted-color">—</span>
                          </div>
                        </div>
                        <div class="mt-1 text-xs text-muted-color">
                          {{ new Date(m.startTime).toLocaleString() }} ·
                          <span :class="statusPillClass(m.status)">{{ statusLabel(m.status) }}</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <TabPanel header="Таблица">
        <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-surface-900">Турнирная таблица</h2>
              <p class="mt-1 text-xs text-muted-color">Автообновляется после сохранения протокола.</p>
            </div>
            <Button
              label="Обновить"
              icon="pi pi-refresh"
              :loading="tableLoading"
              severity="secondary"
              @click="fetchTable"
            />
          </div>

          <div v-if="isGroupedFormat" class="mt-3 space-y-6">
            <div
              v-for="g in (tournament?.groups ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))"
              :key="g.id"
            >
              <div class="text-sm font-semibold text-surface-900">{{ g.name }}</div>
              <DataTable
                :value="groupTables[g.id] ?? []"
                :loading="tableLoading"
                :rowStyle="qualificationRowStyle"
                class="mt-2"
                stripedRows
              >
                <Column field="position" header="#" style="width: 4rem" />
                <Column field="teamName" header="Команда" />
                <Column field="played" header="И" style="width: 4rem" />
                <Column field="wins" header="В" style="width: 4rem" />
                <Column field="draws" header="Н" style="width: 4rem" />
                <Column field="losses" header="П" style="width: 4rem" />
                <Column header="Мячи" style="width: 6rem">
                  <template #body="{ data }">
                    {{ data.goalsFor }}:{{ data.goalsAgainst }}
                  </template>
                </Column>
                <Column field="goalDiff" header="Δ" style="width: 4rem" />
                <Column field="points" header="Очки" style="width: 5rem" />
              </DataTable>
            </div>
          </div>

          <DataTable
            v-else
            :value="table"
            :loading="tableLoading"
            class="mt-3"
            :rowStyle="qualificationRowStyle"
            stripedRows
          >
            <Column field="position" header="#" style="width: 4rem" />
            <Column field="teamName" header="Команда" />
            <Column field="played" header="И" style="width: 4rem" />
            <Column field="wins" header="В" style="width: 4rem" />
            <Column field="draws" header="Н" style="width: 4rem" />
            <Column field="losses" header="П" style="width: 4rem" />
            <Column header="Мячи" style="width: 6rem">
              <template #body="{ data }">
                {{ data.goalsFor }}:{{ data.goalsAgainst }}
              </template>
            </Column>
            <Column field="goalDiff" header="Δ" style="width: 4rem" />
            <Column field="points" header="Очки" style="width: 5rem" />
          </DataTable>
        </div>
      </TabPanel>

      <TabPanel header="Составы">
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4 lg:col-span-2">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-surface-900">Команды турнира</h2>
              <div class="text-xs text-muted-color">
                {{ tournament?.tournamentTeams?.length ?? 0 }} / {{ tournament?.minTeams ?? 0 }}
              </div>
            </div>

            <div class="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <MultiSelect
                v-model="selectedTeamIds"
                :loading="teamsLoading"
                :options="allTeams"
                option-label="name"
                option-value="id"
                :maxSelectedLabels="0"
                selectedItemsLabel="Выбрано: {0}"
                class="w-full"
                placeholder="Выбрать команды"
                filter
                :disabled="!canEditTeams"
              />
              <Button
                label="Сохранить"
                icon="pi pi-check"
                :loading="savingTeams"
                @click="saveTeams"
                :disabled="!canEditTeams"
              />
            </div>

            <div v-if="isGroupedFormat" class="mt-4">
              <div class="text-sm font-semibold text-surface-900">Группы</div>
              <div class="mt-1 text-xs text-muted-color">
                Перетаскивай команды между группами. После генерации календаря распределение будет доступно,
                пока не введены результаты (счёт в матчах). Правки доступны только для черновика.
              </div>

              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <div class="rounded-lg border border-surface-200 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-medium">Группа A</div>
                    <div class="text-xs text-muted-color">{{ groupA.length }}</div>
                  </div>
                  <draggable
                    :list="groupA"
                    item-key="teamId"
                    group="teams-groups"
                    handle=".drag-handle"
                    :disabled="!canEditGroups || groupingSaving"
                    :move="checkGroupMove"
                    class="mt-2 space-y-2"
                    @start="() => { preDragA.value = groupA.map((x) => x.teamId); preDragB.value = groupB.map((x) => x.teamId) }"
                    @change="(e) => onGroupChange(e, groupIdA)"
                  >
                    <template #item="{ element: tt }">
                      <div class="flex items-center justify-between rounded-md border border-surface-200 px-3 py-2">
                        <div class="flex items-center gap-2">
                          <span
                            class="drag-handle pi pi-bars text-muted-color"
                            :class="canEditGroups ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-50'"
                            :title="canEditGroups ? 'Перетащить' : 'Недоступно после генерации'"
                          />
                          <div class="text-sm">{{ tt.team.name }}</div>
                        </div>
                        <Select
                          :modelValue="tt.rating ?? 3"
                          :options="ratingOptions"
                          optionLabel="label"
                          optionValue="value"
                          class="w-20"
                          :disabled="!canEditTeams || ratingSaving || groupingSaving"
                          @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                        />
                      </div>
                    </template>
                  </draggable>
                </div>

                <div class="rounded-lg border border-surface-200 p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-medium">Группа B</div>
                    <div class="text-xs text-muted-color">{{ groupB.length }}</div>
                  </div>
                  <draggable
                    :list="groupB"
                    item-key="teamId"
                    group="teams-groups"
                    handle=".drag-handle"
                    :disabled="!canEditGroups || groupingSaving"
                    :move="checkGroupMove"
                    class="mt-2 space-y-2"
                    @start="() => { preDragA.value = groupA.map((x) => x.teamId); preDragB.value = groupB.map((x) => x.teamId) }"
                    @change="(e) => onGroupChange(e, groupIdB)"
                  >
                    <template #item="{ element: tt }">
                      <div class="flex items-center justify-between rounded-md border border-surface-200 px-3 py-2">
                        <div class="flex items-center gap-2">
                          <span
                            class="drag-handle pi pi-bars text-muted-color"
                            :class="canEditGroups ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-50'"
                            :title="canEditGroups ? 'Перетащить' : 'Недоступно после генерации'"
                          />
                          <div class="text-sm">{{ tt.team.name }}</div>
                        </div>
                        <Select
                          :modelValue="tt.rating ?? 3"
                          :options="ratingOptions"
                          optionLabel="label"
                          optionValue="value"
                          class="w-20"
                          :disabled="!canEditTeams || ratingSaving || groupingSaving"
                          @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                        />
                      </div>
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <ul v-else class="mt-3 space-y-2">
              <li
                v-for="tt in tournament?.tournamentTeams ?? []"
                :key="tt.teamId"
                class="flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2"
              >
                <div class="flex items-center gap-2">
                  <div class="text-sm">{{ tt.team.name }}</div>
                </div>
                <div class="flex items-center gap-3">
                  <Select
                    :modelValue="tt.rating ?? 3"
                    :options="ratingOptions"
                    optionLabel="label"
                    optionValue="value"
                    class="w-20"
                    :disabled="!canEditTeams || ratingSaving || groupingSaving"
                    @update:modelValue="(v) => { tt.rating = v; updateTeamRating(tt.teamId, v) }"
                  />
                  <div class="text-xs text-muted-color">
                    <span v-if="tt.group">{{ tt.group.name }}</span>
                    <span v-else>—</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <h2 class="text-sm font-semibold text-surface-900">Админы турнира</h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="m in tournament?.members ?? []"
                :key="m.id"
                class="rounded-lg border border-surface-200 px-3 py-2"
              >
                <div class="text-sm">
                  {{ m.user.name }}
                  <span class="text-muted-color">({{ m.user.email }})</span>
                </div>
                <div class="text-xs text-muted-color">{{ m.role }}</div>
              </li>
            </ul>
          </div>
        </div>
      </TabPanel>
    </TabView>

    <Dialog
      :visible="calendarDialog"
      @update:visible="(v) => (calendarDialog = v)"
      modal
      header="Генерация календаря"
      :style="{ width: '34rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-surface-900">Формат турнира</div>
              <div class="mt-1 text-sm text-muted-color">
                {{
                  formatOptions.find((x) => x.value === (tournament?.format ?? calendarForm.format))?.label ??
                    (tournament?.format ?? calendarForm.format)
                }}
              </div>
            </div>
            <div class="text-xs text-muted-color">
              Меняется в «Редактировать турнир»
            </div>
          </div>
            <div
              v-if="calendarForm.format === 'GROUPS_PLUS_PLAYOFF' || calendarForm.format === 'GROUPS_2'"
              class="mt-2 rounded-lg border border-surface-200 p-3"
            >
            <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-medium">Режим генерации</div>
              <ToggleSwitch v-model="calendarForm.useTemplate" />
            </div>
            <div class="mt-1 text-xs text-muted-color">
                Пресет `kids_mini_8`: 8 команд (2 группы по 4) + плей-офф.
            </div>
            <div v-if="calendarForm.useTemplate" class="mt-3 text-sm">
              Используется пресет <span class="font-mono text-surface-900">kids_mini_8</span>.
            </div>
          </div>
        </div>
        <div>
          <label class="text-sm block mb-1">Дата старта</label>
          <DatePicker v-model="calendarForm.startDate" class="w-full" dateFormat="yy-mm-dd" showIcon />
        </div>
        <div>
          <label class="text-sm block mb-1">Дата окончания (необязательно)</label>
          <DatePicker v-model="calendarForm.endDate" class="w-full" dateFormat="yy-mm-dd" showIcon />
        </div>
        <div v-if="!calendarForm.useTemplate">
          <label class="text-sm block mb-1">Интервал (дней)</label>
          <InputNumber v-model="calendarForm.intervalDays" class="w-full" :min="1" />
        </div>
        <div v-if="!calendarForm.useTemplate">
          <label class="text-sm block mb-1">Туров в день</label>
          <InputNumber v-model="calendarForm.roundsPerDay" class="w-full" :min="1" />
          <div class="mt-1 text-xs text-muted-color">
            Для однодневного турнира поставь 5–7 (зависит от формата и количества туров).
          </div>
        </div>
        <div v-if="!calendarForm.useTemplate">
          <label class="text-sm block mb-1">Разрешённые дни</label>
          <MultiSelect
            v-model="calendarForm.allowedDays"
            :options="[
              { value: 1, label: 'Пн' },
              { value: 2, label: 'Вт' },
              { value: 3, label: 'Ср' },
              { value: 4, label: 'Чт' },
              { value: 5, label: 'Пт' },
              { value: 6, label: 'Сб' },
              { value: 0, label: 'Вс' },
            ]"
            option-label="label"
            option-value="value"
            :maxSelectedLabels="0"
            selectedItemsLabel="Выбрано: {0}"
            class="w-full"
            placeholder="Любые дни"
            :showToggleAll="false"
          />
        </div>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div class="md:col-span-4">
            <label class="text-sm block mb-1 leading-tight">Длительность, мин</label>
            <InputNumber
              v-model="calendarForm.matchDurationMinutes"
              class="w-full"
              inputClass="w-full"
              :min="1"
            />
          </div>
          <div class="md:col-span-4">
            <label class="text-sm block mb-1 leading-tight">Перерыв, мин</label>
            <InputNumber
              v-model="calendarForm.matchBreakMinutes"
              class="w-full"
              inputClass="w-full"
              :min="0"
            />
          </div>
          <div class="md:col-span-4">
            <label class="text-sm block mb-1 leading-tight">Параллельно</label>
            <InputNumber
              v-model="calendarForm.simultaneousMatches"
              class="w-full"
              inputClass="w-full"
              :min="1"
            />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
          <div class="md:col-span-6">
            <label class="text-sm block mb-1 leading-tight">Время начала дня</label>
            <InputText v-model="calendarForm.dayStartTimeDefault" class="w-full" placeholder="12:00" />
          </div>
          <div class="md:col-span-6">
            <div class="text-xs text-muted-color">Формат: HH:mm (например, 10:30)</div>
          </div>
        </div>
        <div v-if="calendarForm.allowedDays?.length" class="rounded-lg border border-surface-200 p-3">
          <div class="text-sm font-medium">Время начала по дням (override)</div>
          <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              v-for="d in calendarForm.allowedDays"
              :key="d"
              class="flex items-center justify-between gap-3"
            >
              <div class="text-sm text-muted-color">{{ dayLabels[d] }}</div>
              <InputText
                v-model="calendarForm.dayStartTimeOverrides[d]"
                class="w-32"
                :placeholder="calendarForm.dayStartTimeDefault"
              />
            </div>
          </div>
          <div class="mt-2 text-xs text-muted-color">
            Оставь пустым — будет использовано «Время начала дня (по умолчанию)».
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm">
            Заменить существующий календарь
            <div class="text-xs text-muted-color">
              Если выключено и матчи уже есть — сервер вернёт ошибку.
            </div>
          </div>
          <ToggleSwitch v-model="calendarForm.replaceExisting" />
        </div>
      </div>
      <template #footer>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="tournament?.matches?.length"
              label="Очистить календарь"
              icon="pi pi-trash"
              severity="danger"
              text
              :loading="calendarSaving"
              @click="clearCalendar"
            />
            <Button
              v-if="tournament?.format === 'GROUPS_PLUS_PLAYOFF' || tournament?.format === 'GROUPS_2' || tournament?.format === 'GROUPS_4'"
              label="Сгенерировать плей-офф"
              icon="pi pi-sitemap"
              severity="secondary"
              text
              :loading="calendarSaving"
              @click="generatePlayoff"
            />
          </div>
          <div class="flex justify-end gap-2 sm:shrink-0">
            <Button label="Отмена" text @click="calendarDialog = false" />
            <Button
              label="Сгенерировать"
              icon="pi pi-check"
              class="min-w-40"
              :loading="calendarSaving"
              @click="generateCalendar"
            />
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="protocolOpen"
      @update:visible="(v) => (protocolOpen = v)"
      modal
      header="Протокол матча"
      :style="{ width: '36rem' }"
    >
      <div v-if="protocolMatch" class="space-y-4">
        <div class="text-sm">
          <span class="font-medium">
            {{ playoffSlotLabels(protocolMatch)?.home ?? protocolMatch.homeTeam.name }}
          </span>
          <span class="text-muted-color mx-1">
            {{ playoffSlotLabels(protocolMatch) ? '-' : 'vs' }}
          </span>
          <span class="font-medium">
            {{ playoffSlotLabels(protocolMatch)?.away ?? protocolMatch.awayTeam.name }}
          </span>
          <span class="text-muted-color">
            · {{ new Date(protocolMatch.startTime).toLocaleDateString() }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm block mb-1">Счёт (хозяева)</label>
            <InputNumber v-model="protocolForm.homeScore" class="w-full" :min="0" />
          </div>
          <div>
            <label class="text-sm block mb-1">Счёт (гости)</label>
            <InputNumber v-model="protocolForm.awayScore" class="w-full" :min="0" />
          </div>
        </div>

        <div>
          <label class="text-sm block mb-1">Дата и время матча</label>
          <DatePicker v-model="protocolForm.startTime" class="w-full" showTime hourFormat="24" showIcon />
        </div>

        <div>
          <label class="text-sm block mb-1">Статус</label>
          <Select
            v-model="protocolForm.status"
            :options="statusOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">События</label>
            <Button label="Добавить" icon="pi pi-plus" text size="small" @click="addEvent" />
          </div>

          <div v-if="!protocolForm.events.length" class="mt-2 text-sm text-muted-color">
            Пока нет событий.
          </div>

          <div v-else class="mt-2 space-y-2">
            <div
              v-for="(e, idx) in protocolForm.events"
              :key="idx"
              class="rounded-lg border border-surface-200 p-3"
            >
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label class="text-xs block mb-1 text-muted-color">Тип</label>
                  <Select
                    v-model="e.type"
                    :options="eventTypeOptions"
                    option-label="label"
                    option-value="value"
                    class="w-full"
                  />
                </div>
                <div>
                  <label class="text-xs block mb-1 text-muted-color">Команда</label>
                  <Select
                    v-model="e.teamSide"
                    :options="teamSideOptions"
                    option-label="label"
                    option-value="value"
                    class="w-full"
                    @change="() => { e.playerId = '' }"
                  />
                </div>
                <div>
                  <label class="text-xs block mb-1 text-muted-color">Минута</label>
                  <InputNumber v-model="e.minute" class="w-full" :min="0" />
                </div>
                <div>
                  <label class="text-xs block mb-1 text-muted-color">Игрок</label>
                  <Select
                    v-model="e.playerId"
                    :options="e.teamSide === 'HOME' ? protocolHomePlayerOptions : e.teamSide === 'AWAY' ? protocolAwayPlayerOptions : []"
                    option-label="label"
                    option-value="value"
                    class="w-full"
                    placeholder="Выберите игрок"
                    :loading="protocolPlayersLoading"
                    :disabled="protocolPlayersLoading || !e.teamSide"
                  />
                </div>
              </div>
              <div class="mt-2 flex justify-end">
                <Button
                  label="Удалить"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  size="small"
                  @click="removeEvent(idx)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="protocolOpen = false" />
          <Button label="Сохранить" icon="pi pi-check" :loading="protocolSaving" @click="saveProtocol" />
          <Button
            label="Завершить"
            icon="pi pi-check-circle"
            severity="success"
            :loading="protocolSaving"
            :disabled="protocolForm.status === 'CANCELED' || protocolForm.status === 'FINISHED'"
            @click="finishProtocol"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>


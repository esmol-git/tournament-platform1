<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import type { MatchRow, TableRow, TournamentDetails } from '~/types/tournament-admin'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicChessboard from '~/app/components/public/PublicChessboard.vue'
import PublicPlayoff from '~/app/components/public/PublicPlayoff.vue'
import PublicProgress from '~/app/components/public/PublicProgress.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentTabs from '~/app/components/public/PublicTournamentTabs.vue'
import { getTournamentCapabilities } from '~/utils/tournamentFormatCapabilities'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const { loadAllTournaments, fetchTournamentDetail, fetchTable: fetchTablePublic } =
  usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug

const loading = ref(false)
const loadingTable = ref(false)
const errorText = ref('')
/** Становится true после первого полного цикла fetch в onMounted — убирает мигание пустого состояния до загрузки. */
const pageReady = ref(false)

const viewType = ref<'table' | 'chessboard' | 'progress' | 'playoff'>('table')

const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string>('')
const tournamentDetails = ref<TournamentDetails | null>(null)
const selectedTournament = computed(() =>
  tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
)
/** Несколько групп: отдельная таблица на каждую (только групповой этап). */
const groupTableSections = ref<{ id: string; name: string; rows: TableRow[] }[]>([])
/** Одна группа или без деления — одна таблица. */
const singleTableRows = ref<TableRow[]>([])

const tournamentStatusLabel = computed(() => {
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'Идет'
    case 'COMPLETED':
      return 'Завершен'
    case 'ARCHIVED':
      return 'Архив'
    case 'DRAFT':
      return 'Черновик'
    default:
      return 'Не указан'
  }
})

const dateLabel = computed(() => {
  const t = selectedTournament.value
  if (!t) return 'Даты не указаны'
  const s = t.startsAt ? new Date(t.startsAt).toLocaleDateString('ru-RU') : null
  const e = t.endsAt ? new Date(t.endsAt).toLocaleDateString('ru-RU') : null
  if (s && e) return `${s} - ${e}`
  if (s) return `С ${s}`
  if (e) return `До ${e}`
  return 'Даты не указаны'
})

const hasSplitGroups = computed(() => groupTableSections.value.length > 1)

const leader = computed(() => {
  if (hasSplitGroups.value) return null
  return singleTableRows.value[0] ?? null
})

const matchesPlayed = computed(() => {
  if (groupTableSections.value.length) {
    return groupTableSections.value.reduce((sum, sec) => {
      const half = sec.rows.reduce((a, r) => a + Number(r.played ?? 0), 0) / 2
      return sum + half
    }, 0)
  }
  return singleTableRows.value.reduce((acc, r) => acc + Number(r.played ?? 0), 0) / 2
})

const teamsCountDisplay = computed(() => {
  if (groupTableSections.value.length) {
    return groupTableSections.value.reduce((s, g) => s + g.rows.length, 0)
  }
  return singleTableRows.value.length
})

const hasActiveTournaments = computed(() => tournaments.value.length > 0)
const hasSelectedTournament = computed(
  () => !!selectedTournamentId.value && !!selectedTournament.value,
)
const showPageSkeleton = computed(() => {
  return (
    !pageReady.value ||
    loading.value ||
    (loadingTable.value &&
      !groupTableSections.value.length &&
      !singleTableRows.value.length)
  )
})
const tournamentCapabilities = computed(() =>
  getTournamentCapabilities(selectedTournament.value?.format),
)

const availableViews = computed(() => {
  const views: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = []
  if (tournamentCapabilities.value.showTable) views.push('table')
  if (tournamentCapabilities.value.showChessboard) views.push('chessboard')
  if (tournamentCapabilities.value.showProgress) views.push('progress')
  if (tournamentCapabilities.value.showPlayoff) views.push('playoff')
  return views
})

const playoffQualifiersPerGroup = computed(() => {
  const raw = tournamentDetails.value?.playoffQualifiersPerGroup
  if (!Number.isInteger(raw) || (raw as number) <= 0) return 0
  return raw as number
})

function rowClassWithPlayoffCut(data: TableRow) {
  return playoffQualifiersPerGroup.value > 0 && data.position === playoffQualifiersPerGroup.value
    ? 'qualifier-cut-row'
    : ''
}

function readMetaScore(
  events: MatchRow['events'],
  metaType: 'PENALTY_SCORE' | 'EXTRA_TIME_SCORE',
): { home: number; away: number } | null {
  for (const e of events ?? []) {
    const p = e.payload
    if (!p || p.metaType !== metaType) continue
    const h = p.homeScore
    const a = p.awayScore
    if (typeof h === 'number' && typeof a === 'number') return { home: h, away: a }
  }
  return null
}

function resolveWinnerLoser(m: MatchRow): { winner: string; loser: string } | null {
  if (m.homeScore == null || m.awayScore == null) return null
  if (m.homeScore !== m.awayScore) {
    return m.homeScore > m.awayScore
      ? { winner: m.homeTeam.name, loser: m.awayTeam.name }
      : { winner: m.awayTeam.name, loser: m.homeTeam.name }
  }
  const penalties = readMetaScore(m.events, 'PENALTY_SCORE')
  if (penalties && penalties.home !== penalties.away) {
    return penalties.home > penalties.away
      ? { winner: m.homeTeam.name, loser: m.awayTeam.name }
      : { winner: m.awayTeam.name, loser: m.homeTeam.name }
  }
  return null
}

function pickLatest(ms: MatchRow[]) {
  return ms
    .slice()
    .sort((a, b) => {
      const at = a.startTime ? new Date(a.startTime).getTime() : 0
      const bt = b.startTime ? new Date(b.startTime).getTime() : 0
      return bt - at
    })[0]
}

const podium = computed(() => {
  const details = tournamentDetails.value
  const slots = [
    { place: 1, label: '1 место', team: null as string | null },
    { place: 2, label: '2 место', team: null as string | null },
    { place: 3, label: '3 место', team: null as string | null },
  ]
  if (!details) return slots

  const playoffMatches = (details.matches ?? []).filter((m) => m.stage === 'PLAYOFF')
  if (playoffMatches.length) {
    const final = pickLatest(playoffMatches.filter((m) => m.playoffRound === 'FINAL'))
    const third = pickLatest(playoffMatches.filter((m) => m.playoffRound === 'THIRD_PLACE'))
    const finalResult = final ? resolveWinnerLoser(final) : null
    const thirdResult = third ? resolveWinnerLoser(third) : null

    if (finalResult) {
      slots[0].team = finalResult.winner
      slots[1].team = finalResult.loser
    }
    if (thirdResult) {
      slots[2].team = thirdResult.winner
    }
    return slots
  }

  if (!hasSplitGroups.value && singleTableRows.value.length) {
    const sorted = singleTableRows.value.slice().sort((a, b) => a.position - b.position)
    slots[0].team = sorted[0]?.teamName ?? null
    slots[1].team = sorted[1]?.teamName ?? null
    slots[2].team = sorted[2]?.teamName ?? null
  }
  return slots
})

function syncTidToQuery(nextId: string | null) {
  const q: Record<string, any> = { ...route.query }
  if (nextId) q.tid = nextId
  else delete q.tid
  void router.replace({ query: q })
}

selectedTournamentId.value = selectedTid.value ?? ''

async function fetchTournaments() {
  errorText.value = ''
  loading.value = true
  tournamentDetails.value = null
  try {
    const loaded = await loadAllTournaments(tenant.value)

    tournaments.value = loaded
    const ids = new Set(loaded.map((t) => t.id))
    if (selectedTournamentId.value && !ids.has(selectedTournamentId.value)) {
      selectedTournamentId.value = ''
    }
    if (!selectedTournamentId.value) {
      selectedTournamentId.value = loaded[0]?.id ?? ''
      syncTidToQuery(selectedTournamentId.value || null)
    }
  } catch (e: any) {
    tournaments.value = []
    singleTableRows.value = []
    groupTableSections.value = []
    const status = e?.response?.status ?? e?.statusCode
    errorText.value =
      status === 404
        ? 'Тенант не найден. Проверьте ссылку.'
        : 'Не удалось загрузить турниры.'
  } finally {
    loading.value = false
  }
}

async function fetchTable() {
  if (!selectedTournamentId.value) {
    singleTableRows.value = []
    groupTableSections.value = []
    tournamentDetails.value = null
    return
  }

  loadingTable.value = true
  errorText.value = ''
  singleTableRows.value = []
  groupTableSections.value = []
  tournamentDetails.value = null
  try {
    const tid = selectedTournamentId.value
    const detail = await fetchTournamentDetail(tenant.value, tid)
    tournamentDetails.value = detail
    const groups = detail.groups ?? []

    if (groups.length > 1) {
      const sections = await Promise.all(
        groups.map(async (g) => ({
          id: g.id,
          name: g.name,
          rows: await fetchTablePublic(tenant.value, tid, g.id),
        })),
      )
      groupTableSections.value = sections
      singleTableRows.value = []
    } else if (groups.length === 1) {
      singleTableRows.value = await fetchTablePublic(tenant.value, tid, groups[0].id)
      groupTableSections.value = []
    } else {
      singleTableRows.value = await fetchTablePublic(tenant.value, tid)
      groupTableSections.value = []
    }
  } catch {
    singleTableRows.value = []
    groupTableSections.value = []
    errorText.value = 'Не удалось загрузить турнирную таблицу.'
  } finally {
    loadingTable.value = false
  }
}

watch(selectedTournamentId, () => {
  void fetchTable()
  syncTidToQuery(selectedTournamentId.value || null)
})

watch(
  availableViews,
  (views) => {
    if (!views.length) return
    if (!views.includes(viewType.value)) {
      viewType.value = views[0]
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await ensureTenantResolved()

    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    // Синхронизируем сегмент `/{tenant}` в URL с реальным tenantSlug в БД,
    // чтобы ссылки внутри публичного сайта не уводили в другой tenant.
    if (String(route.params.tenant ?? '') !== tenant.value) {
      await router.replace({ params: { tenant: tenant.value }, query: route.query })
    }

    selectedTournamentId.value = selectedTid.value ?? ''
    await fetchTournaments()
    await fetchTable()
  } finally {
    pageReady.value = true
  }
})
</script>

<template>
  <div class="min-h-screen">
    <PublicHeader :tenant="tenant" />

    <div class="mx-auto max-w-6xl px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6">
      <div class="space-y-4">
        <div v-if="showPageSkeleton" class="space-y-4">
          <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
            <Skeleton width="16rem" height="2rem" />
            <Skeleton class="mt-2" width="10rem" height="1rem" />
            <Skeleton class="mt-4" width="22rem" height="2.75rem" />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              v-for="i in 3"
              :key="`sk-stat-${i}`"
              class="rounded-xl border border-surface-200 bg-surface-0 p-4"
            >
              <Skeleton width="6rem" height="0.85rem" />
              <Skeleton class="mt-3" width="8rem" height="1.4rem" />
            </div>
          </div>
          <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
            <Skeleton width="100%" height="16rem" />
          </div>
        </div>

        <template v-else>
        <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold text-surface-900 truncate">
                {{ selectedTournament?.name || `Турнир тенанта ${tenant}` }}
              </h1>
              <p class="mt-1 text-sm text-muted-color">{{ dateLabel }}</p>
            </div>

            <Tag :value="tournamentStatusLabel" severity="contrast" rounded />
          </div>

          <div class="mt-3 max-w-md">
            <FloatLabel v-if="hasActiveTournaments" variant="on">
              <Select
                v-model="selectedTournamentId"
                :options="tournaments"
                optionLabel="name"
                optionValue="id"
                class="w-full"
                :loading="loading"
                placeholder="Выберите турнир"
              />
              <label>Турнир</label>
            </FloatLabel>
            <div
              v-else
              class="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-muted-color"
            >
              Пока нет опубликованных турниров.
            </div>
          </div>
        </div>

        <div v-if="hasSelectedTournament" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            v-for="slot in podium"
            :key="slot.place"
            class="rounded-xl border border-surface-200 bg-surface-0 p-4"
            :class="{
              'ring-2 ring-yellow-300': slot.place === 1,
              'ring-1 ring-slate-300': slot.place === 2,
              'ring-1 ring-amber-300': slot.place === 3,
            }"
          >
            <p class="text-xs text-muted-color">{{ slot.label }}</p>
            <p class="mt-1 text-lg font-semibold truncate">
              {{ slot.team ?? 'Определится' }}
            </p>
          </div>
        </div>

        <div
          v-if="pageReady && !hasSelectedTournament && !errorText"
          class="rounded-2xl border border-surface-200 bg-surface-0 p-6 text-center"
        >
          <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-100">
            <i class="pi pi-inbox text-surface-600" />
          </div>
          <h2 class="text-lg font-semibold text-surface-900">Турниры пока не опубликованы</h2>
          <p class="mt-2 text-sm text-muted-color">
            Когда появится активный турнир, здесь автоматически отобразятся таблица, шахматка,
            прогресс и плей-офф.
          </p>
        </div>

        <PublicTournamentTabs
          v-if="hasSelectedTournament"
          v-model="viewType"
          :capabilities="tournamentCapabilities"
        />

        <div
          v-if="errorText"
          class="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900"
        >
          {{ errorText }}
        </div>

        <div v-else-if="hasSelectedTournament" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">Команд</p>
            <p class="mt-1 text-2xl font-semibold">{{ teamsCountDisplay }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">Сыграно (группы)</p>
            <p class="mt-1 text-2xl font-semibold">{{ matchesPlayed }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">{{ hasSplitGroups ? 'Зачёт' : 'Лидер' }}</p>
            <p v-if="!hasSplitGroups" class="mt-1 text-lg font-semibold truncate">
              {{ leader?.teamName ?? '—' }}
            </p>
            <p v-else class="mt-1 text-sm text-muted-color leading-snug">
              Общей таблицы нет — группы и плей-офф раздельно.
            </p>
          </div>
        </div>

        <div
          v-if="
            hasSelectedTournament &&
            tournamentCapabilities.showTable &&
            viewType === 'table'
          "
        >
          <div
            v-if="playoffQualifiersPerGroup > 0"
            class="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          >
            В плей-офф выходят первые {{ playoffQualifiersPerGroup }} из каждой группы (черта после проходной зоны).
          </div>
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="sec.id"
              class="space-y-2 mb-6 last:mb-0"
            >
              <h2 class="text-lg font-semibold text-surface-900">{{ sec.name }}</h2>
              <div
                v-if="!sec.rows.length"
                class="rounded-2xl border border-surface-200 bg-surface-0 p-6 text-center text-muted-color"
              >
                Таблица группы пока пуста.
              </div>
              <div
                v-else
                class="rounded-2xl overflow-hidden border border-surface-200 bg-surface-0"
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-surface-200 text-xs font-semibold text-muted-color uppercase">
                        <th class="px-3 py-2 text-center" style="width: 4rem">#</th>
                        <th class="px-3 py-2 text-left">Команда</th>
                        <th class="px-3 py-2 text-center" style="width: 4rem">И</th>
                        <th class="px-3 py-2 text-center" style="width: 4rem">В</th>
                        <th class="px-3 py-2 text-center" style="width: 4rem">Н</th>
                        <th class="px-3 py-2 text-center" style="width: 4rem">П</th>
                        <th class="px-3 py-2 text-center" style="width: 8rem">Мячи</th>
                        <th class="px-3 py-2 text-center" style="width: 5rem">+/-</th>
                        <th class="px-3 py-2 text-center" style="width: 6rem">Очки</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in sec.rows"
                        :key="row.teamId"
                        :class="rowClassWithPlayoffCut(row)"
                        class="border-b border-surface-200 even:bg-surface-50"
                      >
                        <td class="px-3 py-2 text-center">{{ row.position }}</td>
                        <td class="px-3 py-2">
                          <span class="font-medium text-surface-900">{{ row.teamName }}</span>
                        </td>
                        <td class="px-3 py-2 text-center">{{ row.played }}</td>
                        <td class="px-3 py-2 text-center">{{ row.wins }}</td>
                        <td class="px-3 py-2 text-center">{{ row.draws }}</td>
                        <td class="px-3 py-2 text-center">{{ row.losses }}</td>
                        <td class="px-3 py-2 text-center">
                          {{ row.goalsFor }}:{{ row.goalsAgainst }}
                        </td>
                        <td class="px-3 py-2 text-center">{{ row.goalDiff }}</td>
                        <td class="px-3 py-2 text-center">
                          <span class="font-semibold tabular-nums">{{ row.points }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="rounded-2xl overflow-hidden border border-surface-200 bg-surface-0">
            <div
              v-if="!singleTableRows.length"
              class="py-10 text-center text-muted-color"
            >
              Таблица пока пуста. Матчи еще не сыграны.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-surface-200 text-xs font-semibold text-muted-color uppercase">
                    <th class="px-3 py-2 text-center" style="width: 4rem">#</th>
                    <th class="px-3 py-2 text-left">Команда</th>
                    <th class="px-3 py-2 text-center" style="width: 4rem">И</th>
                    <th class="px-3 py-2 text-center" style="width: 4rem">В</th>
                    <th class="px-3 py-2 text-center" style="width: 4rem">Н</th>
                    <th class="px-3 py-2 text-center" style="width: 4rem">П</th>
                    <th class="px-3 py-2 text-center" style="width: 8rem">Мячи</th>
                    <th class="px-3 py-2 text-center" style="width: 5rem">+/-</th>
                    <th class="px-3 py-2 text-center" style="width: 6rem">Очки</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in singleTableRows"
                    :key="row.teamId"
                    :class="rowClassWithPlayoffCut(row)"
                    class="border-b border-surface-200 even:bg-surface-50"
                  >
                    <td class="px-3 py-2 text-center">{{ row.position }}</td>
                    <td class="px-3 py-2">
                      <span class="font-medium text-surface-900">{{ row.teamName }}</span>
                    </td>
                    <td class="px-3 py-2 text-center">{{ row.played }}</td>
                    <td class="px-3 py-2 text-center">{{ row.wins }}</td>
                    <td class="px-3 py-2 text-center">{{ row.draws }}</td>
                    <td class="px-3 py-2 text-center">{{ row.losses }}</td>
                    <td class="px-3 py-2 text-center">
                      {{ row.goalsFor }}:{{ row.goalsAgainst }}
                    </td>
                    <td class="px-3 py-2 text-center">{{ row.goalDiff }}</td>
                    <td class="px-3 py-2 text-center">
                      <span class="font-semibold tabular-nums">{{ row.points }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showChessboard &&
            viewType === 'chessboard'
          "
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`ch-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0"
            >
              <h2 class="text-lg font-semibold text-surface-900 px-1">{{ sec.name }}</h2>
              <PublicChessboard :tournament-id="selectedTournamentId" :group-id="sec.id" />
            </div>
          </template>
          <PublicChessboard v-else :tournament-id="selectedTournamentId" />
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showProgress &&
            viewType === 'progress'
          "
        >
          <template v-if="groupTableSections.length">
            <div
              v-for="sec in groupTableSections"
              :key="`pr-${sec.id}`"
              class="space-y-2 mb-6 last:mb-0"
            >
              <h2 class="text-lg font-semibold text-surface-900 px-1">{{ sec.name }}</h2>
              <PublicProgress :tournament-id="selectedTournamentId" :group-id="sec.id" />
            </div>
          </template>
          <PublicProgress v-else :tournament-id="selectedTournamentId" />
        </div>

        <div
          v-else-if="
            hasSelectedTournament &&
            tournamentCapabilities.showPlayoff &&
            viewType === 'playoff'
          "
        >
          <PublicPlayoff :tournament-id="selectedTournamentId" />
        </div>
        </template>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        active="table"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.qualifier-cut-row td) {
  border-bottom-width: 2px !important;
  border-bottom-color: rgb(52 211 153) !important;
}
</style>


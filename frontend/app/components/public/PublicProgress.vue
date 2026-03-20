<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'

import type { MatchRow, TableRow, TournamentDetails } from '~/types/tournament-admin'

const props = defineProps<{
  tournamentId: string
}>()

const { apiUrl } = useApiUrl()
const { token, syncWithStorage, authFetch } = useAuth()

const loading = ref(false)
const errorText = ref('')
const authRequired = ref(false)

const rows = ref<TableRow[]>([])
const matches = ref<MatchRow[]>([])

const sortedRows = computed(() => rows.value.slice().sort((a, b) => a.position - b.position))

type ResultVariant = 'wins' | 'draws' | 'losses'
type TeamResultToken = {
  key: string
  text: string
  variant: ResultVariant
}

function resultTokenClass(variant: ResultVariant) {
  switch (variant) {
    case 'wins':
      return 'inline-flex items-center justify-center rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-800'
    case 'draws':
      return 'inline-flex items-center justify-center rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-800'
    case 'losses':
      return 'inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800'
  }
}

const resultsByTeamId = computed<Record<string, TeamResultToken[]>>(() => {
  const map: Record<string, TeamResultToken[]> = {}

  // Ensure stable ordering in UI even if some teams have no results.
  for (const r of sortedRows.value) map[r.teamId] = []

  const played = (matches.value ?? []).filter((m) => m.homeScore != null && m.awayScore != null)
  played.sort((a, b) => {
    const at = a.startTime ? new Date(a.startTime).getTime() : 0
    const bt = b.startTime ? new Date(b.startTime).getTime() : 0
    return at - bt
  })

  const push = (teamId: string, token: TeamResultToken) => {
    if (!map[teamId]) map[teamId] = []
    map[teamId].push(token)
  }

  for (const m of played) {
    const hs = m.homeScore as number
    const as = m.awayScore as number

    const homeId = m.homeTeam.id
    const awayId = m.awayTeam.id

    // Team perspective: team score first.
    const homeOutcome: ResultVariant = hs > as ? 'wins' : hs === as ? 'draws' : 'losses'
    const awayOutcome: ResultVariant = as > hs ? 'wins' : as === hs ? 'draws' : 'losses'

    push(homeId, {
      key: `m:${m.id}|t:${homeId}`,
      text: `${hs}:${as}`,
      variant: homeOutcome,
    })
    push(awayId, {
      key: `m:${m.id}|t:${awayId}`,
      text: `${as}:${hs}`,
      variant: awayOutcome,
    })
  }

  return map
})

async function load() {
  errorText.value = ''
  rows.value = []
  matches.value = []
  if (!props.tournamentId) return

  if (!token.value) {
    authRequired.value = true
    return
  }

  authRequired.value = false
  loading.value = true
  try {
    const [table, details] = await Promise.all([
      authFetch<TableRow[]>(apiUrl(`/tournaments/${props.tournamentId}/table`), {
        headers: { Authorization: `Bearer ${token.value}` },
      }),
      authFetch<TournamentDetails>(apiUrl(`/tournaments/${props.tournamentId}`), {
        headers: { Authorization: `Bearer ${token.value}` },
      }),
    ])
    rows.value = table
    matches.value = details.matches ?? []
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode
    if (status === 401) {
      authRequired.value = true
      return
    }
    errorText.value = 'Не удалось загрузить прогресс.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.tournamentId,
  () => {
    void load()
  },
  { immediate: true },
)

onMounted(() => {
  syncWithStorage()
})
</script>

<template>
  <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-surface-900">Прогресс</div>
        <div class="text-xs text-muted-color mt-1">Все результаты турнира по командам.</div>
      </div>
    </div>

    <div v-if="authRequired" class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
      Для просмотра нужен вход в админку.
    </div>

    <div v-else-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>

    <div v-else-if="loading" class="mt-4 text-sm text-muted-color">
      Загрузка результатов...
    </div>

    <div v-else-if="!sortedRows.length" class="mt-4 py-10 text-center text-muted-color">
      Пока нет команд.
    </div>

    <div v-else class="mt-4 overflow-hidden rounded-xl border border-surface-200">
      <div class="grid grid-cols-1">
        <div
          class="grid grid-cols-[4rem_1fr_2fr] gap-3 bg-surface-100 border-b border-surface-200 px-3 py-2 text-xs font-semibold text-surface-800"
        >
          <div>Команда</div>
          <div>Название</div>
          <div>Результаты</div>
        </div>

        <div
          v-for="r in sortedRows"
          :key="r.teamId"
          class="grid grid-cols-[4rem_1fr_2fr] gap-3 items-start px-3 py-3 border-b border-surface-200 bg-surface-0"
        >
          <div class="text-sm font-semibold text-surface-800">
            Команда {{ r.position }}
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-medium text-surface-900">{{ r.teamName }}</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-for="t in resultsByTeamId[r.teamId] ?? []"
              :key="t.key"
              :class="resultTokenClass(t.variant)"
            >
              {{ t.text }}
            </span>

            <span
              v-if="(resultsByTeamId[r.teamId] ?? []).length === 0"
              class="text-sm text-muted-color"
            >
              —
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


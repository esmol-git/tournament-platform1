<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'

import type { TableRow, TournamentDetails, MatchRow } from '~/types/tournament-admin'

const props = defineProps<{
  tournamentId: string
}>()

const { apiUrl } = useApiUrl()
const { token, syncWithStorage, authFetch } = useAuth()

const loading = ref(false)
const errorText = ref('')
const authRequired = ref(false)

const tableRows = ref<TableRow[]>([])
const matches = ref<MatchRow[]>([])

const teamsInOrder = computed(() => {
  return tableRows.value
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ id: r.teamId, name: r.teamName, position: r.position }))
})

const cellTextByKey = computed(() => {
  const grid: Record<string, string> = {}
  const played = (matches.value ?? []).filter((m) => m.homeScore != null && m.awayScore != null)

  const push = (rowId: string, colId: string, text: string) => {
    const key = `${rowId}|${colId}`
    const cur = grid[key]
    if (!cur) grid[key] = text
    else grid[key] = `${cur} / ${text}`
  }

  for (const m of played) {
    const homeId = m.homeTeam.id
    const awayId = m.awayTeam.id
    const hs = m.homeScore as number
    const as = m.awayScore as number

    // row perspective: row team score first
    push(homeId, awayId, `${hs}:${as}`)
    push(awayId, homeId, `${as}:${hs}`)
  }

  return grid
})

const load = async () => {
  errorText.value = ''
  tableRows.value = []
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

    tableRows.value = table
    matches.value = details.matches ?? []
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode
    if (status === 401) {
      authRequired.value = true
      return
    }
    errorText.value = 'Не удалось загрузить шахматку.'
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
  if (process.client) syncWithStorage()
})
</script>

<template>
  <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-surface-900">Шахматка</div>
        <div class="text-xs text-muted-color mt-1">
          Счёт между командами (как в интернете: таблица взаимных встреч).
        </div>
      </div>
    </div>

    <div v-if="authRequired" class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
      Для просмотра нужна авторизация.
    </div>
    <div v-else-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>

    <div v-else-if="loading" class="mt-4 text-sm text-muted-color">
      Загрузка шахматки...
    </div>

    <div v-else-if="!tableRows.length" class="mt-4 rounded-xl border border-surface-200 bg-surface-0 p-5 text-muted-color text-center">
      В шахматке пока нет данных.
    </div>

    <div v-else class="mt-4 overflow-x-auto">
      <table class="min-w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              class="sticky left-0 z-10 bg-surface-0 border border-surface-200 px-2 py-2 font-medium text-left"
            >
              Команда
            </th>
            <th
              v-for="t in teamsInOrder"
              :key="t.id"
              class="border border-surface-200 px-2 py-2 font-medium text-center whitespace-nowrap"
            >
              {{ t.position }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in teamsInOrder" :key="row.id">
            <th
              class="sticky left-0 z-10 bg-surface-0 border border-surface-200 px-2 py-2 font-medium text-left whitespace-nowrap"
            >
              {{ row.position }}. {{ row.name }}
            </th>
            <td
              v-for="col in teamsInOrder"
              :key="col.id"
              class="border border-surface-200 px-2 py-2 text-center whitespace-nowrap"
            >
              <span v-if="row.id === col.id" class="text-muted-color">—</span>
              <span v-else class="font-medium text-surface-800">
                {{ cellTextByKey[`${row.id}|${col.id}`] ?? '—' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>


<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import type { TableRow } from '~/types/tournament-admin'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicChessboard from '~/app/components/public/PublicChessboard.vue'
import PublicProgress from '~/app/components/public/PublicProgress.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import PublicTournamentTabs from '~/app/components/public/PublicTournamentTabs.vue'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const { apiUrl } = useApiUrl()
const { token, syncWithStorage, authFetch } = useAuth()

const tenant = computed(() => route.params.tenant as string)

const loading = ref(false)
const loadingTable = ref(false)
const authRequired = ref(false)
const errorText = ref('')

const viewType = ref<'table' | 'chessboard' | 'progress'>('table')

const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string>('')
const selectedTournament = computed(() =>
  tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
)
const tableRows = ref<TableRow[]>([])

const tournamentStatusLabel = computed(() => {
  switch (selectedTournament.value?.status) {
    case 'ACTIVE':
      return 'Идет'
    case 'ARCHIVED':
      return 'Завершен'
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

const leader = computed(() => tableRows.value[0] ?? null)
const matchesPlayed = computed(() => tableRows.value.reduce((acc, r) => acc + Number(r.played ?? 0), 0) / 2)

function getTidFromQuery(): string | null {
  const tid = route.query.tid
  return typeof tid === 'string' && tid.trim() ? tid : null
}

function syncTidToQuery(nextId: string | null) {
  const q: Record<string, any> = { ...route.query }
  if (nextId) q.tid = nextId
  else delete q.tid
  void router.replace({ query: q })
}

// Инициализируем selectedTournamentId из query-параметра (если передан)
selectedTournamentId.value = getTidFromQuery() ?? ''

async function fetchTournaments() {
  if (!token.value) {
    authRequired.value = true
    tournaments.value = []
    tableRows.value = []
    return
  }

  authRequired.value = false
  errorText.value = ''
  loading.value = true
  try {
    const data = await authFetch<TournamentRow[]>(
      apiUrl(`/tenants/${tenant.value}/tournaments`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    tournaments.value = data
    if (!selectedTournamentId.value) {
      const active = data.find((t) => t.status === 'ACTIVE')
      selectedTournamentId.value = active?.id ?? data[0]?.id ?? ''
      syncTidToQuery(selectedTournamentId.value || null)
    }
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode
    if (status === 401) {
      authRequired.value = true
      tournaments.value = []
      tableRows.value = []
      return
    }
    errorText.value = 'Не удалось загрузить турниры.'
  } finally {
    loading.value = false
  }
}

async function fetchTable() {
  if (!selectedTournamentId.value || !token.value) {
    tableRows.value = []
    return
  }

  loadingTable.value = true
  errorText.value = ''
  try {
    const data = await authFetch<TableRow[]>(
      apiUrl(`/tournaments/${selectedTournamentId.value}/table`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    tableRows.value = data
  } catch {
    tableRows.value = []
    errorText.value = 'Не удалось загрузить турнирную таблицу.'
  } finally {
    loadingTable.value = false
  }
}

watch(selectedTournamentId, () => {
  void fetchTable()
  syncTidToQuery(selectedTournamentId.value || null)
})

onMounted(async () => {
  syncWithStorage()
  await fetchTournaments()
  await fetchTable()
})
</script>

<template>
  <div class="min-h-screen">
    <PublicHeader :tenant="tenant" />

    <div class="mx-auto max-w-6xl px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6">
      <div class="space-y-4">
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
            <FloatLabel variant="on">
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
          </div>
        </div>

        <PublicTournamentTabs v-model="viewType" />

        <div
          v-if="authRequired"
          class="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900"
        >
          Для просмотра нужна авторизация. Войдите в админку и обновите страницу.
        </div>
        <div
          v-else-if="errorText"
          class="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900"
        >
          {{ errorText }}
        </div>

        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">Команд</p>
            <p class="mt-1 text-2xl font-semibold">{{ tableRows.length }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">Сыграно</p>
            <p class="mt-1 text-2xl font-semibold">{{ matchesPlayed }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
            <p class="text-xs text-muted-color">Лидер</p>
            <p class="mt-1 text-lg font-semibold truncate">{{ leader?.teamName ?? '—' }}</p>
          </div>
        </div>

        <div v-if="viewType === 'table'">
          <DataTable
            :value="tableRows"
            :loading="loadingTable"
            stripedRows
            responsiveLayout="scroll"
            class="rounded-2xl overflow-hidden border border-surface-200 bg-surface-0"
          >
            <template #empty>
              <div class="py-10 text-center text-muted-color">
                Таблица пока пуста. Матчи еще не сыграны.
              </div>
            </template>
            <Column field="position" header="#" style="width: 4rem" />
            <Column field="teamName" header="Команда" />
            <Column field="played" header="И" style="width: 4rem" />
            <Column field="wins" header="В" style="width: 4rem" />
            <Column field="draws" header="Н" style="width: 4rem" />
            <Column field="losses" header="П" style="width: 4rem" />
            <Column header="Мячи" style="width: 8rem">
              <template #body="{ data }">
                {{ data.goalsFor }}:{{ data.goalsAgainst }}
              </template>
            </Column>
            <Column field="goalDiff" header="+/-" style="width: 5rem" />
            <Column field="points" header="Очки" style="width: 6rem">
              <template #body="{ data }">
                <span class="font-semibold">{{ data.points }}</span>
              </template>
            </Column>
          </DataTable>
        </div>

        <div v-else-if="viewType === 'chessboard'">
          <PublicChessboard :tournament-id="selectedTournamentId" />
        </div>

        <div v-else-if="viewType === 'progress'">
          <PublicProgress :tournament-id="selectedTournamentId" />
        </div>
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


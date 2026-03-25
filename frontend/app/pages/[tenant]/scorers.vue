<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TournamentDetails } from '~/types/tournament-admin'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const { loadAllTournaments, fetchTournamentDetail, fetchRoster } = usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const errorText = ref('')
const pageReady = ref(false)

const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string>('')
const selectedTournament = computed(() =>
  tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
)

const loading = ref(false)

const scorersLoading = ref(false)
const goals = ref<PlayerStatRow[]>([])
const assists = ref<PlayerStatRow[]>([])
const cards = ref<PlayerStatRow[]>([])
const showPageSkeleton = computed(() => {
  return (
    !pageReady.value ||
    loading.value ||
    (scorersLoading.value &&
      !goals.value.length &&
      !assists.value.length &&
      !cards.value.length)
  )
})

type PlayerStatRow = {
  rank: number
  playerId: string
  playerName: string
  teamName: string | null
  value: number
}

function syncTidToQuery(nextId: string | null) {
  const q: Record<string, any> = { ...route.query }
  if (nextId) q.tid = nextId
  else delete q.tid
  void router.replace({ query: q })
}

function playerFullName(p: { firstName: string; lastName: string } | null | undefined) {
  if (!p) return '—'
  const last = p.lastName?.trim()
  const first = p.firstName?.trim()
  if (last && first) return `${last} ${first}`
  return last || first || '—'
}

async function fetchTournaments() {
  errorText.value = ''
  loading.value = true
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
    goals.value = []
    assists.value = []
    cards.value = []
    const status = e?.response?.status ?? e?.statusCode
    errorText.value =
      status === 404
        ? 'Тенант не найден. Проверьте ссылку.'
        : 'Не удалось загрузить турниры.'
  } finally {
    loading.value = false
  }
}

async function fetchScorers() {
  if (!selectedTournamentId.value) {
    goals.value = []
    assists.value = []
    cards.value = []
    return
  }

  scorersLoading.value = true
  errorText.value = ''
  goals.value = []
  assists.value = []
  cards.value = []
  try {
    const tid = selectedTournamentId.value
    const res = await fetchTournamentDetail(tenant.value, tid)
    const roster = await fetchRoster(tenant.value, tid)

    const playersById = new Map<string, { playerName: string; teamName: string | null }>()
    for (const row of roster) {
      const tn = row.teamName ?? null
      for (const p of row.players) {
        playersById.set(p.id, {
          playerName: playerFullName(p),
          teamName: tn,
        })
      }
    }

    const goalsMap = new Map<string, number>()
    const assistsMap = new Map<string, number>()
    const cardsMap = new Map<string, number>()

    for (const m of res.matches ?? []) {
      for (const ev of m.events ?? []) {
        const pid = ev.playerId ?? null
        if (!pid) continue

        if (ev.type === 'GOAL') {
          goalsMap.set(pid, (goalsMap.get(pid) ?? 0) + 1)

          // Optional: backend may store assist in event.payload (e.g. { assistId: '...' }).
          const anyEv = ev as any
          const assistId = anyEv?.payload?.assistId ?? anyEv?.payload?.assistPlayerId ?? null
          if (assistId) assistsMap.set(assistId, (assistsMap.get(assistId) ?? 0) + 1)
        }

        if (ev.type === 'CARD') {
          cardsMap.set(pid, (cardsMap.get(pid) ?? 0) + 1)
        }
      }
    }

    const toRows = (map: Map<string, number>): PlayerStatRow[] => {
      return Array.from(map.entries())
        .map(([playerId, value]) => {
          const info = playersById.get(playerId)
          return {
            rank: 0,
            playerId,
            playerName: info?.playerName ?? playerId,
            teamName: info?.teamName ?? null,
            value,
          }
        })
        .sort((a, b) => b.value - a.value || a.playerName.localeCompare(b.playerName))
        .slice(0, 20)
        .map((row, idx) => ({ ...row, rank: idx + 1 }))
    }

    goals.value = toRows(goalsMap)
    assists.value = toRows(assistsMap)
    cards.value = toRows(cardsMap)
  } catch {
    goals.value = []
    assists.value = []
    cards.value = []
    errorText.value = 'Не удалось загрузить статистику.'
  } finally {
    scorersLoading.value = false
  }
}

watch(selectedTournamentId, () => {
  syncTidToQuery(selectedTournamentId.value || null)
  void fetchScorers()
})

onMounted(async () => {
  try {
    await ensureTenantResolved()

    if (tenantNotFound.value) {
      errorText.value = 'Тенант не найден. Проверьте ссылку.'
      return
    }

    if (String(route.params.tenant ?? '') !== tenant.value) {
      await router.replace({ params: { tenant: tenant.value }, query: route.query })
    }

    selectedTournamentId.value = selectedTid.value ?? ''
    await fetchTournaments()
    await fetchScorers()
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
            <Skeleton class="mt-4" width="22rem" height="2.75rem" />
          </div>
          <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
            <Skeleton width="11rem" height="1rem" />
            <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div
                v-for="i in 3"
                :key="`sc-sk-${i}`"
                class="rounded-xl border border-surface-200 bg-surface-0 p-4"
              >
                <Skeleton width="8rem" height="1rem" />
                <Skeleton class="mt-3" width="100%" height="1.25rem" />
                <Skeleton class="mt-2" width="100%" height="1.25rem" />
                <Skeleton class="mt-2" width="100%" height="1.25rem" />
              </div>
            </div>
          </div>
        </div>

        <template v-else>
        <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold text-surface-900 truncate">
                {{ selectedTournament?.name || `Статистика турнира` }}
              </h1>
            </div>
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

        <div v-if="errorText" class="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          {{ errorText }}
        </div>

        <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="text-sm font-semibold text-surface-900">Статистика игроков</div>
              <div class="text-xs text-muted-color mt-1">
                Бомбардиры, ассистенты (если они есть в событиях) и карточки.
              </div>
            </div>
          </div>

          <div v-if="scorersLoading" class="mt-4 text-sm text-muted-color">
            Загрузка статистики...
          </div>

          <div v-else class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
              <div class="text-sm font-semibold text-surface-900">Бомбардиры</div>
              <div v-if="goals.length" class="mt-3 space-y-2">
                <div
                  v-for="r in goals"
                  :key="r.playerId"
                  class="flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-surface-800">
                      {{ r.rank }}. {{ r.playerName }}
                    </div>
                    <div class="text-xs text-muted-color truncate">{{ r.teamName ?? '—' }}</div>
                  </div>
                  <div class="text-sm font-semibold tabular-nums">{{ r.value }}</div>
                </div>
              </div>
              <div v-else class="mt-3 text-sm text-muted-color">Пока нет данных.</div>
            </div>

            <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
              <div class="text-sm font-semibold text-surface-900">Ассистенты</div>
              <div v-if="assists.length" class="mt-3 space-y-2">
                <div
                  v-for="r in assists"
                  :key="r.playerId"
                  class="flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-surface-800">
                      {{ r.rank }}. {{ r.playerName }}
                    </div>
                    <div class="text-xs text-muted-color truncate">{{ r.teamName ?? '—' }}</div>
                  </div>
                  <div class="text-sm font-semibold tabular-nums">{{ r.value }}</div>
                </div>
              </div>
              <div v-else class="mt-3 text-sm text-muted-color">Пока нет данных.</div>
            </div>

            <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
              <div class="text-sm font-semibold text-surface-900">Карточки</div>
              <div v-if="cards.length" class="mt-3 space-y-2">
                <div
                  v-for="r in cards"
                  :key="r.playerId"
                  class="flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-surface-800">
                      {{ r.rank }}. {{ r.playerName }}
                    </div>
                    <div class="text-xs text-muted-color truncate">{{ r.teamName ?? '—' }}</div>
                  </div>
                  <div class="text-sm font-semibold tabular-nums">{{ r.value }}</div>
                </div>
              </div>
              <div v-else class="mt-3 text-sm text-muted-color">Пока нет данных.</div>
            </div>
          </div>
        </div>
        </template>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        active="players"
      />
    </div>
  </div>
</template>


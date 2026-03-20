<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuth } from '~/composables/useAuth'
import type { TournamentDetails, CalendarRound, CalendarViewMode } from '~/types/tournament-admin'
import { buildCalendarRoundsFromMatches } from '~/utils/tournamentMatchCalendar'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import type { TournamentRow } from '~/types/admin/tournaments-index'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const { apiUrl } = useApiUrl()
const { token, syncWithStorage, authFetch } = useAuth()

const tenant = computed(() => route.params.tenant as string)

const authRequired = ref(false)
const errorText = ref('')
const loading = ref(false)

const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string>('')
const selectedTournament = computed(() =>
  tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
)

const calendarLoading = ref(false)
const calendarRounds = ref<CalendarRound[]>([])
const calendarViewMode = ref<CalendarViewMode>('grouped')

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

selectedTournamentId.value = getTidFromQuery() ?? ''

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

async function fetchTournaments() {
  if (!token.value) {
    authRequired.value = true
    tournaments.value = []
    calendarRounds.value = []
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
      calendarRounds.value = []
      return
    }
    errorText.value = 'Не удалось загрузить турниры.'
  } finally {
    loading.value = false
  }
}

async function fetchCalendar() {
  if (!selectedTournamentId.value || !token.value) {
    calendarRounds.value = []
    return
  }

  calendarLoading.value = true
  errorText.value = ''
  try {
    const res = await authFetch<TournamentDetails>(
      apiUrl(`/tournaments/${selectedTournamentId.value}`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )

    calendarRounds.value = buildCalendarRoundsFromMatches(
      res.matches ?? [],
      res.groups ?? [],
    )
  } catch {
    calendarRounds.value = []
    errorText.value = 'Не удалось загрузить календарь матчей.'
  } finally {
    calendarLoading.value = false
  }
}

watch(selectedTournamentId, () => {
  void fetchCalendar()
  syncTidToQuery(selectedTournamentId.value || null)
})

onMounted(async () => {
  syncWithStorage()
  await fetchTournaments()
  await fetchCalendar()
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

        <div
          v-if="authRequired"
          class="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900"
        >
          Для просмотра нужно войти в админку.
        </div>

        <div v-else-if="errorText" class="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          {{ errorText }}
        </div>

        <div v-else class="space-y-4">
          <div v-if="calendarLoading" class="rounded-2xl border border-surface-200 bg-surface-0 p-5">
            Загрузка расписания...
          </div>

          <div
            v-else-if="!calendarRounds.length"
            class="rounded-2xl border border-surface-200 bg-surface-0 p-5"
          >
            В календаре пока нет матчей.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="r in calendarRounds"
              :key="r.key"
              class="rounded-2xl border border-surface-200 bg-surface-0 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-semibold text-surface-900">{{ r.title }}</div>
                  <div class="text-sm text-muted-color">{{ r.dateLabel }}</div>
                </div>
                <div class="text-xs text-muted-color">
                  {{ r.matches.length }} {{ r.matches.length === 1 ? 'матч' : 'матча' }}
                </div>
              </div>

              <div class="mt-3 space-y-2">
                <div
                  v-for="m in r.matches"
                  :key="m.id"
                  class="flex items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0 px-3 py-2"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate">
                      {{ m.homeTeam.name }} vs {{ m.awayTeam.name }}
                    </div>
                    <div class="text-xs text-muted-color">
                      {{
                        new Date(m.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      }}
                      <span v-if="m.stage">· {{ m.stage === 'GROUP' ? 'Группа' : 'Плей-офф' }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="text-sm font-semibold">
                      <template v-if="m.homeScore != null && m.awayScore != null">
                        {{ m.homeScore }}:{{ m.awayScore }}
                      </template>
                      <template v-else>—</template>
                    </div>
                    <NuxtLink
                      :to="`/${tenant}/match-${m.id}`"
                      class="text-sm text-primary hover:underline"
                    >
                      Детали
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        active="calendar"
      />
    </div>
  </div>
</template>


<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import type { TournamentDetails, CalendarRound, CalendarViewMode } from '~/types/tournament-admin'
import { buildCalendarRoundsFromMatches } from '~/utils/tournamentMatchCalendar'
import { formatMatchScoreDisplay } from '~/utils/tournamentAdminUi'

import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicTournamentSidebar from '~/app/components/public/PublicTournamentSidebar.vue'
import type { TournamentRow } from '~/types/admin/tournaments-index'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

definePageMeta({ layout: 'public' })

const route = useRoute()
const router = useRouter()
const { loadAllTournaments, fetchTournamentDetail } = usePublicTournamentFetch()

const { tenantSlug, selectedTid, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const errorText = ref('')
const loading = ref(false)
const pageReady = ref(false)

const tournaments = ref<TournamentRow[]>([])
const selectedTournamentId = ref<string>('')
const selectedTournament = computed(() =>
  tournaments.value.find((t) => t.id === selectedTournamentId.value) ?? null,
)

const calendarLoading = ref(false)
const calendarRounds = ref<CalendarRound[]>([])
const showPageSkeleton = computed(() => {
  return (
    !pageReady.value ||
    loading.value ||
    (calendarLoading.value && !calendarRounds.value.length)
  )
})
const calendarViewMode = ref<CalendarViewMode>('grouped')
const matchStatsOpen = ref(false)
const matchStatsTab = ref(0)
const selectedMatchForStats = ref<TournamentDetails['matches'][number] | null>(null)

function syncTidToQuery(nextId: string | null) {
  const q: Record<string, any> = { ...route.query }
  if (nextId) q.tid = nextId
  else delete q.tid
  void router.replace({ query: q })
}

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

function sideLabel(side?: 'HOME' | 'AWAY' | null) {
  if (side === 'HOME') return 'Хозяева'
  if (side === 'AWAY') return 'Гости'
  return '—'
}

function eventMinuteLabel(minute?: number | null) {
  if (minute == null) return '—'
  return `${minute}'`
}

function openMatchStats(m: TournamentDetails['matches'][number]) {
  selectedMatchForStats.value = m
  matchStatsTab.value = 0
  matchStatsOpen.value = true
}

const selectedMatchGoals = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'GOAL')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchCards = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'CARD')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchSubs = computed(() =>
  (selectedMatchForStats.value?.events ?? [])
    .filter((e) => e.type === 'SUBSTITUTION')
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
)

const selectedMatchSummary = computed(() => {
  const m = selectedMatchForStats.value
  if (!m) return null
  const bySide = (type: 'GOAL' | 'CARD' | 'SUBSTITUTION', side: 'HOME' | 'AWAY') =>
    (m.events ?? []).filter((e) => e.type === type && e.teamSide === side).length
  return {
    goalsHome: bySide('GOAL', 'HOME'),
    goalsAway: bySide('GOAL', 'AWAY'),
    cardsHome: bySide('CARD', 'HOME'),
    cardsAway: bySide('CARD', 'AWAY'),
    subsHome: bySide('SUBSTITUTION', 'HOME'),
    subsAway: bySide('SUBSTITUTION', 'AWAY'),
    totalEvents: (m.events ?? []).length,
  }
})

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
    calendarRounds.value = []
    const status = e?.response?.status ?? e?.statusCode
    errorText.value =
      status === 404
        ? 'Тенант не найден. Проверьте ссылку.'
        : 'Не удалось загрузить турниры.'
  } finally {
    loading.value = false
  }
}

async function fetchCalendar() {
  if (!selectedTournamentId.value) {
    calendarRounds.value = []
    return
  }

  calendarLoading.value = true
  errorText.value = ''
  calendarRounds.value = []
  try {
    const res = await fetchTournamentDetail(tenant.value, selectedTournamentId.value)

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
    await fetchCalendar()
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
            <Skeleton class="mt-2" width="11rem" height="1rem" />
            <Skeleton class="mt-4" width="22rem" height="2.75rem" />
          </div>
          <div
            v-for="i in 3"
            :key="`cal-sk-${i}`"
            class="rounded-2xl border border-surface-200 bg-surface-0 p-4"
          >
            <Skeleton width="13rem" height="1.2rem" />
            <Skeleton class="mt-2" width="8rem" height="0.9rem" />
            <Skeleton class="mt-3" width="100%" height="3.25rem" />
            <Skeleton class="mt-2" width="100%" height="3.25rem" />
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
                  class="rounded-xl border border-surface-200 bg-surface-0 px-3 py-2"
                >
                  <div class="flex items-center justify-between gap-3">
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
                          {{ formatMatchScoreDisplay(m) }}
                        </template>
                        <template v-else>—</template>
                      </div>
                      <Button
                        label="Статистика"
                        size="small"
                        text
                        @click="openMatchStats(m)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>
      </div>

      <PublicTournamentSidebar
        :tenant="tenant"
        :tid="selectedTournamentId"
        :tournament-name="selectedTournament?.name"
        active="calendar"
      />
    </div>
    <Dialog
      :visible="matchStatsOpen"
      @update:visible="(v) => (matchStatsOpen = v)"
      modal
      :draggable="false"
      :style="{ width: '52rem', maxWidth: '96vw' }"
      :header="selectedMatchForStats ? `${selectedMatchForStats.homeTeam.name} — ${selectedMatchForStats.awayTeam.name}` : 'Статистика матча'"
    >
      <div v-if="selectedMatchForStats" class="space-y-3">
        <div class="text-sm text-muted-color">
          {{
            new Date(selectedMatchForStats.startTime).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          }}
        </div>

        <TabView :activeIndex="matchStatsTab" @update:activeIndex="(v) => (matchStatsTab = v)">
          <TabPanel header="Общая">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="rounded-xl border border-surface-200 bg-surface-50 p-3">
                <div class="text-xs text-muted-color">Счёт</div>
                <div class="mt-1 text-lg font-semibold">{{ formatMatchScoreDisplay(selectedMatchForStats) }}</div>
              </div>
              <div class="rounded-xl border border-surface-200 bg-surface-50 p-3">
                <div class="text-xs text-muted-color">События</div>
                <div class="mt-1 text-lg font-semibold">{{ selectedMatchSummary?.totalEvents ?? 0 }}</div>
              </div>
              <div class="rounded-xl border border-surface-200 bg-surface-50 p-3">
                <div class="text-xs text-muted-color">Голы</div>
                <div class="mt-1 font-medium">
                  {{ selectedMatchSummary?.goalsHome ?? 0 }} : {{ selectedMatchSummary?.goalsAway ?? 0 }}
                </div>
              </div>
              <div class="rounded-xl border border-surface-200 bg-surface-50 p-3">
                <div class="text-xs text-muted-color">Карточки</div>
                <div class="mt-1 font-medium">
                  {{ selectedMatchSummary?.cardsHome ?? 0 }} : {{ selectedMatchSummary?.cardsAway ?? 0 }}
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Голы">
            <div v-if="!selectedMatchGoals.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchGoals"
                :key="e.id"
                class="rounded-lg border border-surface-200 px-3 py-2 text-sm"
              >
                <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                · {{ sideLabel(e.teamSide) }}
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Карточки">
            <div v-if="!selectedMatchCards.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchCards"
                :key="e.id"
                class="rounded-lg border border-surface-200 px-3 py-2 text-sm"
              >
                <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                · {{ sideLabel(e.teamSide) }}
              </div>
            </div>
          </TabPanel>

          <TabPanel header="Замены">
            <div v-if="!selectedMatchSubs.length" class="text-sm text-muted-color">Событий нет.</div>
            <div v-else class="space-y-2">
              <div
                v-for="e in selectedMatchSubs"
                :key="e.id"
                class="rounded-lg border border-surface-200 px-3 py-2 text-sm"
              >
                <span class="font-medium">{{ eventMinuteLabel(e.minute) }}</span>
                · {{ sideLabel(e.teamSide) }}
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </Dialog>
  </div>
</template>


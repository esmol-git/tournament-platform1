<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { MatchRow, TenantTournamentMatchRow } from '~/types/tournament-admin'
import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import {
  formatDateTimeNoSeconds,
  formatMatchScoreDisplay,
  isMatchEditLocked,
  statusLabel,
  statusPillClass,
} from '~/utils/tournamentAdminUi'
import { computed, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { token, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()

const loading = ref(false)
const standaloneMatches = ref<MatchRow[]>([])
const teams = ref<TeamLite[]>([])
const tournaments = ref<TournamentRow[]>([])

const activeTab = ref(0)
const loadingTournamentMatches = ref(false)
const tournamentMatches = ref<TenantTournamentMatchRow[]>([])
const tournamentMatchFilterId = ref<string>('')
const detachingTournamentMatchId = ref<string | null>(null)

const protocolStandalone = ref(true)
const protocolTournamentIdForDialog = ref<string | null>(null)

const manualTournaments = computed(() =>
  tournaments.value.filter((t) => t.format === 'MANUAL'),
)

function isUnknownPlayoffTeamName(name: string) {
  const normalized = name.trim().toLowerCase()
  return (
    normalized.includes('победитель матча') ||
    normalized.includes('проигравший матча') ||
    /^[a-z]\d+$/i.test(normalized)
  )
}

function shouldHideUnknownPlayoffMatch(m: TenantTournamentMatchRow) {
  if (m.stage !== 'PLAYOFF') return false
  return (
    isUnknownPlayoffTeamName(m.homeTeam.name) ||
    isUnknownPlayoffTeamName(m.awayTeam.name)
  )
}

const visibleTournamentMatches = computed(() =>
  tournamentMatches.value.filter((m) => !shouldHideUnknownPlayoffMatch(m)),
)
const visibleTournamentMatchesWithIndex = computed(() =>
  visibleTournamentMatches.value.map((m, index) => ({
    ...m,
    matchNumber: index + 1,
  })),
)

const teamOptions = computed(() =>
  teams.value.map((t) => ({ label: t.name, value: t.id })),
)

const attachTournamentByMatchId = reactive<Record<string, string>>({})

const createOpen = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
})

const editOpen = ref(false)
const editSaving = ref(false)
const editForm = reactive({
  matchId: '',
  homeTeamId: '',
  awayTeamId: '',
  startTime: null as Date | null,
})

const protocolOpen = ref(false)
const protocolMatch = ref<MatchRow | null>(null)

const deletingId = ref<string | null>(null)

const fetchStandalone = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const res = await authFetch<MatchRow[]>(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    standaloneMatches.value = res
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить матчи',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    loading.value = false
  }
}

const fetchTournamentMatchesList = async () => {
  if (!token.value) return
  loadingTournamentMatches.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('pageSize', '100')
    params.set('excludeUndeterminedPlayoff', 'true')
    if (tournamentMatchFilterId.value) {
      params.set('tournamentId', tournamentMatchFilterId.value)
    }
    const res = await authFetch<{
      items: TenantTournamentMatchRow[]
      total: number
    }>(apiUrl(`/tenants/${tenantId.value}/matches?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    tournamentMatches.value = res.items ?? []
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить матчи турниров',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
    tournamentMatches.value = []
  } finally {
    loadingTournamentMatches.value = false
  }
}

const fetchTeams = async () => {
  if (!token.value) return
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    teams.value = res.items ?? []
  } catch {
    teams.value = []
  }
}

const fetchTournaments = async () => {
  if (!token.value) return
  try {
    const loaded: TournamentRow[] = []
    let page = 1
    let total = 0
    do {
      const res = await authFetch<TournamentListResponse>(
        apiUrl(`/tenants/${tenantId.value}/tournaments`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page, pageSize: 100 },
        },
      )
      const items = res.items ?? []
      total = res.total ?? items.length
      loaded.push(...items)
      page += 1
      if (!items.length) break
    } while (loaded.length < total)
    tournaments.value = loaded
  } catch {
    tournaments.value = []
  }
}

const openCreate = () => {
  createForm.homeTeamId = ''
  createForm.awayTeamId = ''
  createForm.startTime = new Date()
  createOpen.value = true
}

const submitCreate = async () => {
  if (!token.value) return
  if (!createForm.homeTeamId || !createForm.awayTeamId || !createForm.startTime) {
    toast.add({ severity: 'warn', summary: 'Заполните команды и время', life: 4000 })
    return
  }
  if (createForm.homeTeamId === createForm.awayTeamId) {
    toast.add({ severity: 'warn', summary: 'Нужны две разные команды', life: 4000 })
    return
  }
  createSaving.value = true
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        homeTeamId: createForm.homeTeamId,
        awayTeamId: createForm.awayTeamId,
        startTime: createForm.startTime.toISOString(),
      },
    })
    createOpen.value = false
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Матч создан', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось создать матч',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    createSaving.value = false
  }
}

const openEdit = (m: MatchRow) => {
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Расписание и состав завершённого матча нельзя менять.',
      life: 4000,
    })
    return
  }
  editForm.matchId = m.id
  editForm.homeTeamId = m.homeTeam.id
  editForm.awayTeamId = m.awayTeam.id
  editForm.startTime = new Date(m.startTime)
  editOpen.value = true
}

const submitEdit = async () => {
  if (!token.value || !editForm.matchId || !editForm.startTime) return
  if (editForm.homeTeamId === editForm.awayTeamId) {
    toast.add({ severity: 'warn', summary: 'Нужны две разные команды', life: 4000 })
    return
  }
  editSaving.value = true
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches/${editForm.matchId}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          startTime: editForm.startTime.toISOString(),
          homeTeamId: editForm.homeTeamId,
          awayTeamId: editForm.awayTeamId,
        },
      },
    )
    editOpen.value = false
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Сохранено', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    editSaving.value = false
  }
}

const openProtocolStandalone = (m: MatchRow) => {
  protocolStandalone.value = true
  protocolTournamentIdForDialog.value = null
  protocolMatch.value = m
  protocolOpen.value = true
}

const openProtocolFromTournament = (m: TenantTournamentMatchRow) => {
  protocolStandalone.value = false
  protocolTournamentIdForDialog.value = m.tournament.id
  protocolMatch.value = m
  protocolOpen.value = true
}

const onProtocolSaved = async () => {
  await fetchStandalone()
  if (activeTab.value === 1) await fetchTournamentMatchesList()
}

const deleteMatchConfirmOpen = ref(false)
const matchToDelete = ref<MatchRow | null>(null)
const deleteMatchMessage =
  'Удалить этот матч? Он исчезнет из списка свободных матчей; восстановить его нельзя.'

function requestDeleteMatch(m: MatchRow) {
  if (!token.value) return
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Удаление завершённых матчей недоступно.',
      life: 4000,
    })
    return
  }
  matchToDelete.value = m
  deleteMatchConfirmOpen.value = true
}

async function confirmDeleteMatch() {
  const m = matchToDelete.value
  if (!token.value || !m) return
  deletingId.value = m.id
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/standalone-matches/${m.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await fetchStandalone()
    toast.add({ severity: 'success', summary: 'Матч удалён', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deletingId.value = null
    matchToDelete.value = null
  }
}

const attachToTournament = async (m: MatchRow) => {
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя прикрепить завершённый матч к турниру.',
      life: 4000,
    })
    return
  }
  const tid = attachTournamentByMatchId[m.id]
  if (!token.value || !tid) {
    toast.add({
      severity: 'warn',
      summary: 'Выберите турнир',
      detail: 'Нужен турнир с ручным расписанием (MANUAL), куда уже включены обе команды.',
      life: 5000,
    })
    return
  }
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/standalone-matches/${m.id}/attach`),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { tournamentId: tid },
      },
    )
    delete attachTournamentByMatchId[m.id]
    await fetchStandalone()
    toast.add({
      severity: 'success',
      summary: 'Матч прикреплён к турниру',
      detail: 'Матч появился в турнире; таблица пересчитана.',
      life: 4000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось прикрепить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  }
}

const detachMatchConfirmOpen = ref(false)
const tournamentMatchToDetach = ref<TenantTournamentMatchRow | null>(null)
const detachMatchMessage =
  'Открепить матч от турнира? Он появится среди свободных; таблица турнира пересчитается.'

function requestDetachTournamentMatch(m: TenantTournamentMatchRow) {
  if (!token.value) return
  if (m.tournament.format !== 'MANUAL') {
    toast.add({
      severity: 'warn',
      summary: 'Только MANUAL',
      detail: 'Открепление доступно для турниров с ручным расписанием.',
      life: 5000,
    })
    return
  }
  if (isMatchEditLocked(m.status)) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Нельзя открепить завершённый матч.',
      life: 4000,
    })
    return
  }
  tournamentMatchToDetach.value = m
  detachMatchConfirmOpen.value = true
}

async function confirmDetachTournamentMatch() {
  const m = tournamentMatchToDetach.value
  if (!token.value || !m) return
  detachingTournamentMatchId.value = m.id
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/matches/${m.id}/detach`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    await Promise.all([fetchTournamentMatchesList(), fetchStandalone()])
    toast.add({
      severity: 'success',
      summary: 'Матч откреплён',
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось открепить',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    detachingTournamentMatchId.value = null
    tournamentMatchToDetach.value = null
  }
}

watch(tournamentMatchFilterId, () => {
  if (activeTab.value === 1) void fetchTournamentMatchesList()
})

watch(activeTab, (i) => {
  if (i === 1) void fetchTournamentMatchesList()
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  await Promise.all([fetchTeams(), fetchTournaments(), fetchStandalone()])
})
</script>

<template>
  <section class="p-6 space-y-8">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">Матчи</h1>
      <p class="mt-2 text-sm text-muted-color max-w-3xl">
        Создавайте матчи <strong>без привязки к турниру</strong>, ведите протокол, затем
        <strong>прикрепляйте</strong> к турниру с <strong>ручным расписанием</strong> (MANUAL). В турнире в
        <strong>«Составах»</strong> должны быть обе команды; если групп несколько — они должны быть в
        <strong>одной и той же группе</strong> (иначе матч не попадёт в групповую таблицу). Удобнее сразу вести
        расписание в карточке турнира: вкладка «Матчи» → «Добавить матч».
      </p>
    </div>

    <TabView v-model:activeIndex="activeTab">
      <TabPanel header="Свободные матчи">
    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-0">
          Без турнира
        </h2>
        <Button
          label="Создать матч"
          icon="pi pi-plus"
          size="small"
          :disabled="teams.length < 2"
          @click="openCreate"
        />
      </div>
      <p v-if="teams.length < 2" class="mt-2 text-xs text-muted-color">
        Нужно минимум две команды в арендаторе — добавьте их в разделе команд.
      </p>
      <p v-else-if="!manualTournaments.length" class="mt-2 text-xs text-muted-color">
        Пока нет турниров формата «только ручное расписание» (MANUAL) — прикрепление будет доступно после их
        создания.
      </p>
      <p v-else class="mt-2 text-xs text-muted-color max-w-3xl">
        Прикрепление проверяет состав турнира и, при нескольких группах, что обе команды в одной группе; при успехе у
        матча проставится нужный <code class="text-xs">groupId</code> для таблицы.
      </p>

      <div v-if="loading" class="mt-4 text-sm text-muted-color">Загрузка…</div>
      <div v-else-if="!standaloneMatches.length" class="mt-4 text-sm text-muted-color">
        Пока нет свободных матчей.
      </div>

      <DataTable v-else :value="standaloneMatches" dataKey="id" stripedRows class="mt-4">
        <Column field="startTime" header="Начало" style="min-width: 10rem">
          <template #body="{ data }">
            {{ formatDateTimeNoSeconds(data.startTime) }}
          </template>
        </Column>
        <Column header="Хозяева" style="min-width: 8rem">
          <template #body="{ data }">
            {{ data.homeTeam.name }}
          </template>
        </Column>
        <Column header="Гости" style="min-width: 8rem">
          <template #body="{ data }">
            {{ data.awayTeam.name }}
          </template>
        </Column>
        <Column header="Счёт" style="width: 5rem">
          <template #body="{ data }">
            <span v-if="data.homeScore !== null && data.awayScore !== null">
              {{ formatMatchScoreDisplay(data) }}
            </span>
            <span v-else class="text-muted-color">—</span>
          </template>
        </Column>
        <Column header="Статус" style="width: 8rem">
          <template #body="{ data }">
            <span :class="statusPillClass(data.status)">{{ statusLabel(data.status) }}</span>
          </template>
        </Column>
        <Column header="Прикрепить к турниру (MANUAL)" style="min-width: 14rem">
          <template #body="{ data }">
            <div class="flex flex-wrap items-center gap-2">
              <Select
                v-model="attachTournamentByMatchId[data.id]"
                :options="manualTournaments.map((t) => ({ label: t.name, value: t.id }))"
                optionLabel="label"
                optionValue="value"
                class="min-w-[12rem]"
                placeholder="Турнир"
                :disabled="!manualTournaments.length || isMatchEditLocked(data.status)"
              />
              <Button
                label="Прикрепить"
                icon="pi pi-link"
                size="small"
                :disabled="!manualTournaments.length || isMatchEditLocked(data.status)"
                @click="attachToTournament(data)"
              />
            </div>
          </template>
        </Column>
        <Column
          header="Действия"
          style="min-width: 11rem"
          headerClass="text-right"
          :headerStyle="{ textAlign: 'right' }"
        >
          <template #body="{ data }">
            <div class="w-full flex flex-wrap gap-1 justify-end">
              <Button
                label="Протокол"
                icon="pi pi-pencil"
                text
                size="small"
                @click="openProtocolStandalone(data)"
              />
              <Button
                label="Изменить"
                icon="pi pi-calendar"
                text
                size="small"
                :disabled="isMatchEditLocked(data.status)"
                @click="openEdit(data)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :disabled="isMatchEditLocked(data.status)"
                :loading="deletingId === data.id"
                @click="requestDeleteMatch(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
      </TabPanel>

      <TabPanel header="В турнирах">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex flex-col gap-1 sm:max-w-md">
              <label class="text-xs font-medium text-muted-color">Турнир</label>
              <Select
                v-model="tournamentMatchFilterId"
                :options="[
                  { label: 'Все турниры', value: '' },
                  ...tournaments.map((t) => ({ label: t.name, value: t.id })),
                ]"
                option-label="label"
                option-value="value"
                class="w-full"
                placeholder="Все турниры"
              />
            </div>
          </div>

          <div v-if="loadingTournamentMatches" class="text-sm text-muted-color">Загрузка…</div>
          <div v-else-if="!visibleTournamentMatches.length" class="text-sm text-muted-color">
            Нет матчей в турнирах (с учётом фильтра).
          </div>

          <DataTable v-else :value="visibleTournamentMatchesWithIndex" data-key="id" striped-rows>
            <Column header="#" style="width: 4rem">
              <template #body="{ data }">
                {{ data.matchNumber }}
              </template>
            </Column>
            <Column field="startTime" header="Начало" style="min-width: 10rem">
              <template #body="{ data }">
                {{ formatDateTimeNoSeconds(data.startTime) }}
              </template>
            </Column>
            <Column header="Турнир" style="min-width: 10rem">
              <template #body="{ data }">
                <NuxtLink
                  :to="`/admin/tournaments/${data.tournament.id}`"
                  class="text-primary hover:underline font-medium"
                >
                  {{ data.tournament.name }}
                </NuxtLink>
              </template>
            </Column>
            <Column header="Хозяева" style="min-width: 8rem">
              <template #body="{ data }">
                {{ data.homeTeam.name }}
              </template>
            </Column>
            <Column header="Гости" style="min-width: 8rem">
              <template #body="{ data }">
                {{ data.awayTeam.name }}
              </template>
            </Column>
            <Column header="Счёт" style="width: 5rem">
              <template #body="{ data }">
                <span v-if="data.homeScore !== null && data.awayScore !== null">
                  {{ formatMatchScoreDisplay(data) }}
                </span>
                <span v-else class="text-muted-color">—</span>
              </template>
            </Column>
            <Column header="Статус" style="width: 8rem">
              <template #body="{ data }">
                <span :class="statusPillClass(data.status)">{{ statusLabel(data.status) }}</span>
              </template>
            </Column>
            <Column
              header="Действия"
              style="min-width: 12rem"
              headerClass="text-right"
              :headerStyle="{ textAlign: 'right' }"
            >
              <template #body="{ data }">
                <div class="w-full flex flex-wrap gap-1 justify-end">
                  <Button
                    label="Протокол"
                    icon="pi pi-pencil"
                    text
                    size="small"
                    @click="openProtocolFromTournament(data)"
                  />
                  <Button
                    v-if="data.tournament.format === 'MANUAL'"
                    label="Открепить"
                    icon="pi pi-unlock"
                    text
                    size="small"
                    :disabled="isMatchEditLocked(data.status)"
                    :loading="detachingTournamentMatchId === data.id"
                    @click="requestDetachTournamentMatch(data)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </TabPanel>
    </TabView>

    <AdminConfirmDialog
      v-model="deleteMatchConfirmOpen"
      title="Удалить матч?"
      :message="deleteMatchMessage"
      @confirm="confirmDeleteMatch"
    />

    <AdminConfirmDialog
      v-model="detachMatchConfirmOpen"
      title="Открепить матч?"
      :message="detachMatchMessage"
      confirm-label="Открепить"
      confirm-severity="warn"
      @confirm="confirmDetachTournamentMatch"
    />

    <Dialog
      v-model:visible="createOpen"
      modal
      header="Новый матч (без турнира)"
      :style="{ width: '36rem' }"
    >
      <div class="space-y-4">
        <div>
          <label class="text-sm block mb-1">Хозяева</label>
          <Select
            v-model="createForm.homeTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :disabled="createSaving"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Гости</label>
          <Select
            v-model="createForm.awayTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            placeholder="Команда"
            :disabled="createSaving"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Начало</label>
          <DatePicker
            v-model="createForm.startTime"
            class="w-full"
            showTime
            hourFormat="24"
            showIcon
            :disabled="createSaving"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text :disabled="createSaving" @click="createOpen = false" />
        <Button label="Создать" icon="pi pi-check" :loading="createSaving" @click="submitCreate" />
      </template>
    </Dialog>

    <Dialog v-model:visible="editOpen" modal header="Параметры матча" :style="{ width: '36rem' }">
      <div v-if="editForm.matchId" class="space-y-4">
        <div>
          <label class="text-sm block mb-1">Хозяева</label>
          <Select
            v-model="editForm.homeTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            :disabled="editSaving"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Гости</label>
          <Select
            v-model="editForm.awayTeamId"
            :options="teamOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            :disabled="editSaving"
          />
        </div>
        <p class="text-xs text-muted-color">
          Смена пар сбрасывает счёт и события на сервере.
        </p>
        <div>
          <label class="text-sm block mb-1">Начало</label>
          <DatePicker
            v-model="editForm.startTime"
            class="w-full"
            showTime
            hourFormat="24"
            showIcon
            :disabled="editSaving"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Отмена" text :disabled="editSaving" @click="editOpen = false" />
        <Button label="Сохранить" icon="pi pi-check" :loading="editSaving" @click="submitEdit" />
      </template>
    </Dialog>

    <AdminMatchProtocolDialog
      v-model:visible="protocolOpen"
      :standalone="protocolStandalone"
      :tournament-id="protocolTournamentIdForDialog"
      :tournament="null"
      :match="protocolMatch"
      @saved="onProtocolSaved"
    />
  </section>
</template>

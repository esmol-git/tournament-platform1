<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { PLAYER_POSITION_OPTIONS } from '~/constants/playerPositions'
import {
  useLazyPaginatedTeamsSelect,
  useTeamSelectOptions,
} from '~/composables/useLazyPaginatedTeamsSelect'
import type { PlayerRow } from '~/types/admin/player'
import { getApiErrorMessage } from '~/utils/apiError'
import { toYmdLocal as toYmd } from '~/utils/dateYmd'
import { useRouter } from 'vue-router'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch, authFetchBlob } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const tenantId = useTenantId()

/** Амплуа в форме — общий справочник `constants/playerPositions` */
const positionOptions = [...PLAYER_POSITION_OPTIONS]

const positionFilterOptions = computed(() => [
  { value: '', label: 'Все амплуа' },
  ...PLAYER_POSITION_OPTIONS,
])

/** Селект «Команда» в форме и в фильтре таблицы — ленивая пагинация через composable */
const {
  teamsLoading,
  teamsLoadingMore,
  teamsLoaded,
  selectedTeamCache,
  teamsHasMore,
  onTeamSelectFilter,
  onTeamSelectPanelShow,
  onTeamSelectPanelHide,
} = useLazyPaginatedTeamsSelect({
  panelRootClass: '.player-team-select-panel',
  tenantId,
  token,
  authFetch,
  apiUrl,
})

const {
  teamsLoading: listFilterTeamsLoading,
  teamsLoadingMore: listFilterTeamsLoadingMore,
  teamsLoaded: listFilterTeamsLoaded,
  selectedTeamCache: listFilterSelectedTeamCache,
  teamsHasMore: listFilterTeamsHasMore,
  fetchTeamsPage: fetchListFilterTeamsPage,
  onTeamSelectFilter: onListFilterTeamSelectFilter,
  onTeamSelectPanelShow: onListFilterTeamSelectPanelShow,
  onTeamSelectPanelHide: onListFilterTeamSelectPanelHide,
} = useLazyPaginatedTeamsSelect({
  panelRootClass: '.player-list-team-filter-panel',
  tenantId,
  token,
  authFetch,
  apiUrl,
})

const loading = ref(false)
const players = ref<PlayerRow[]>([])
const totalPlayers = ref(0)

const pageSize = ref(10)
const first = ref(0)
const currentPage = ref(1)

const sortField = ref<string | null>(null)
const sortOrder = ref<number | null>(null)

const filters = reactive({
  /** Поиск по имени и/или фамилии (слова через пробел) */
  name: '',
  position: '',
  /** Фильтр по команде (id) */
  teamId: '',
  /** Диапазон дат рождения [от, до] — как в PrimeVue selectionMode="range" */
  birthDateRange: null as Date[] | null,
})

let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** Те же фильтры/сортировка, что у таблицы (без пагинации) — для экспорта CSV */
const buildPlayerExportParams = (): Record<string, string | number> => {
  const params: Record<string, string | number> = {}
  if (sortField.value) params.sortField = sortField.value
  if (sortOrder.value === 1 || sortOrder.value === -1) params.sortOrder = sortOrder.value
  if (filters.name.trim()) params.name = filters.name.trim()
  if (filters.position.trim()) params.position = filters.position.trim()
  if (filters.teamId.trim()) params.teamId = filters.teamId.trim()
  const br = filters.birthDateRange
  if (br && br.length >= 2 && br[0] && br[1]) {
    const a = br[0]
    const b = br[1]
    const from = a <= b ? a : b
    const to = a <= b ? b : a
    params.birthDateFrom = toYmd(from)
    params.birthDateTo = toYmd(to)
  }
  return params
}

const csvDownloading = ref(false)
const csvImporting = ref(false)
const csvFileInput = ref<HTMLInputElement | null>(null)

const downloadPlayersCsv = async () => {
  if (!token.value) return
  csvDownloading.value = true
  try {
    const params = buildPlayerExportParams()
    const blob = await authFetchBlob(apiUrl(`/tenants/${tenantId.value}/players/export/csv`), {
      params,
    })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `players-export.csv`
    a.click()
    URL.revokeObjectURL(href)
    toast.add({
      severity: 'success',
      summary: 'CSV скачан',
      detail: 'До 20 000 строк с учётом текущих фильтров.',
      life: 4000,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось скачать CSV',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    csvDownloading.value = false
  }
}

const triggerCsvImport = () => {
  if (csvImporting.value) return
  csvFileInput.value?.click()
}

const onCsvFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !token.value) return

  csvImporting.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await authFetch<{
      created: number
      updated: number
      errors: Array<{ row: number; message: string }>
    }>(apiUrl(`/tenants/${tenantId.value}/players/import/csv`), {
      method: 'POST',
      body: fd,
    })

    await fetchPlayers()

    const errList = res.errors ?? []
    const errCount = errList.length
    const preview =
      errCount > 0
        ? ` Строки с ошибками: ${errList
            .slice(0, 5)
            .map((x) => `${x.row} (${x.message})`)
            .join('; ')}${errCount > 5 ? '…' : ''}`
        : ''

    toast.add({
      severity: errCount ? 'warn' : 'success',
      summary: errCount ? 'Импорт завершён с ошибками' : 'Импорт выполнен',
      detail: `Создано: ${res.created}, обновлено: ${res.updated}.${preview}`,
      life: errCount ? 12000 : 5000,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Импорт CSV не удался',
      detail: getApiErrorMessage(err),
      life: 7000,
    })
  } finally {
    csvImporting.value = false
  }
}

const fetchPlayers = async () => {
  if (!token.value) return
  loading.value = true
  const page = Math.max(1, Math.floor(Number(currentPage.value) || 1))
  const pageSizeNum = Math.max(1, Math.floor(Number(pageSize.value) || 10))

  try {
    const params: Record<string, any> = {
      page,
      pageSize: pageSizeNum,
    }
    if (sortField.value) params.sortField = sortField.value
    if (sortOrder.value === 1 || sortOrder.value === -1) params.sortOrder = sortOrder.value
    if (filters.name.trim()) params.name = filters.name.trim()
    if (filters.position.trim()) params.position = filters.position.trim()
    if (filters.teamId.trim()) params.teamId = filters.teamId.trim()
    const br = filters.birthDateRange
    if (br && br.length >= 2 && br[0] && br[1]) {
      const a = br[0]
      const b = br[1]
      const from = a <= b ? a : b
      const to = a <= b ? b : a
      params.birthDateFrom = toYmd(from)
      params.birthDateTo = toYmd(to)
    }

    const res = await authFetch<{ items: PlayerRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params,
      },
    )

    players.value = res.items
    totalPlayers.value = res.total
  } finally {
    loading.value = false
  }
}

const scheduleFilterFetch = () => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
  filterDebounceTimer = setTimeout(() => {
    filterDebounceTimer = null
    currentPage.value = 1
    first.value = 0
    fetchPlayers()
  }, 350)
}

watch(
  () => [filters.name, filters.position, filters.teamId, filters.birthDateRange] as const,
  () => scheduleFilterFetch(),
  { deep: true },
)

const onPlayersPage = (event: any) => {
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? pageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : pageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  first.value = nextFirst
  pageSize.value = nextSize
  currentPage.value = nextPage
  fetchPlayers()
}

const onPlayersSort = (event: any) => {
  const nextField = typeof event.sortField === 'string' ? event.sortField : null
  const nextOrder = event.sortOrder === 1 || event.sortOrder === -1 ? event.sortOrder : null

  // Разрешаем только поля, которые есть в DTO/Prisma
  sortField.value = nextField && ['lastName', 'firstName', 'birthDate', 'position'].includes(nextField)
    ? nextField
    : null
  sortOrder.value = nextOrder

  currentPage.value = 1
  first.value = 0
  fetchPlayers()
}

const resetFilters = () => {
  if (filterDebounceTimer) {
    clearTimeout(filterDebounceTimer)
    filterDebounceTimer = null
  }
  filters.name = ''
  filters.position = ''
  filters.teamId = ''
  filters.birthDateRange = null
  listFilterSelectedTeamCache.value = null
  currentPage.value = 1
  first.value = 0
  fetchPlayers()
}

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)

const form = reactive({
  firstName: '',
  lastName: '',
  birthDate: null as Date | null,
  position: '',
  phone: '',
  bioNumber: '',
  photoUrl: '',
  biography: '',
  /** одна команда или пусто */
  teamId: '',
})

const listFilterTeamSelectOptions = useTeamSelectOptions(
  listFilterTeamsLoaded,
  listFilterSelectedTeamCache,
  () => filters.teamId,
  { value: '', label: 'Все команды' },
)

watch(
  () => filters.teamId,
  (id) => {
    if (!id) {
      return
    }
    const hit = listFilterTeamsLoaded.value.find((t) => t.id === id)
    if (hit) {
      listFilterSelectedTeamCache.value = hit
    }
  },
)

const teamSelectOptions = useTeamSelectOptions(
  teamsLoaded,
  selectedTeamCache,
  () => form.teamId,
  { value: '', label: 'Без команды' },
)

const openCreate = () => {
  selectedTeamCache.value = null
  editingId.value = null
  form.firstName = ''
  form.lastName = ''
  form.birthDate = null
  form.position = ''
  form.phone = ''
  form.bioNumber = ''
  form.photoUrl = ''
  form.biography = ''
  form.teamId = ''
  showForm.value = true
}

const openEdit = (p: PlayerRow) => {
  selectedTeamCache.value = p.team ?? null
  editingId.value = p.id
  form.firstName = p.firstName ?? ''
  form.lastName = p.lastName ?? ''
  form.birthDate = p.birthDate ? new Date(p.birthDate) : null
  form.position = p.position ?? ''
  form.phone = p.phone ?? ''
  form.bioNumber = p.bioNumber ?? ''
  form.photoUrl = p.photoUrl ?? ''
  form.biography = p.biography ?? ''
  form.teamId = p.team?.id ?? ''
  showForm.value = true
}

const photoFileInput = ref<HTMLInputElement | null>(null)
const photoUploading = ref(false)
const photoRemoving = ref(false)

const triggerPhotoPick = () => {
  if (photoUploading.value || photoRemoving.value) return
  photoFileInput.value?.click()
}

const onPhotoFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  const maxBytes = 15 * 1024 * 1024
  if (file.size > maxBytes) {
    toast.add({
      severity: 'warn',
      summary: 'Файл слишком большой',
      detail: 'Максимум 15 МБ.',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

  photoUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=players'), {
      method: 'POST',
      body,
    })
    const imageUrl = res.url
    form.photoUrl = imageUrl

    if (isEdit.value && editingId.value && token.value) {
      try {
        await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token.value}` },
          body: { photoUrl: imageUrl },
        })
        await fetchPlayers()
        toast.add({
          severity: 'success',
          summary: 'Фото загружено и сохранено',
          life: 3000,
        })
      } catch (patchErr: unknown) {
        toast.add({
          severity: 'warn',
          summary: 'Файл загружен, но ссылка не записана в игрока',
          detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
          life: 7000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Фото загружено',
        detail: 'Нажми «Создать», чтобы сохранить игрока.',
        life: 4000,
      })
    }
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось загрузить',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    photoUploading.value = false
    if (target) target.value = ''
  }
}

const removePlayerPhoto = async (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  if (!form.photoUrl || photoUploading.value || photoRemoving.value) return

  form.photoUrl = ''

  if (isEdit.value && editingId.value && token.value) {
    photoRemoving.value = true
    try {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { photoUrl: null },
      })
      await fetchPlayers()
      toast.add({
        severity: 'success',
        summary: 'Фото удалено',
        life: 2500,
      })
    } catch (err: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось убрать фото',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      photoRemoving.value = false
    }
  }
}

const savePlayer = async () => {
  if (!token.value) return
  saving.value = true
  try {
    const payload: any = {
      firstName: form.firstName,
      lastName: form.lastName,
      position: form.position || undefined,
      phone: form.phone || undefined,
      birthDate: form.birthDate ? toYmd(form.birthDate) : undefined,
      bioNumber: form.bioNumber || undefined,
      biography: form.biography || undefined,
      photoUrl: form.photoUrl || undefined,
    }

    if (isEdit.value) {
      payload.teamId = form.teamId.trim() ? form.teamId.trim() : null
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: payload,
      })
    } else {
      if (form.teamId.trim()) {
        payload.teamId = form.teamId.trim()
      }
      await authFetch(apiUrl(`/tenants/${tenantId.value}/players`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: payload,
      })
    }

    showForm.value = false
    await fetchPlayers()
  } finally {
    saving.value = false
  }
}

const deletePlayer = async (p: PlayerRow) => {
  if (!token.value) return
  if (!confirm(`Удалить игрока "${p.lastName} ${p.firstName}"?`)) return
  await authFetch(apiUrl(`/tenants/${tenantId.value}/players/${p.id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token.value}` },
  })
  await fetchPlayers()
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  fetchPlayers()
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900">Игроки</h1>
        <p class="mt-1 text-sm text-muted-color">Справочник игроков тенанта.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 justify-end">
        <Button
          label="Скачать CSV"
          icon="pi pi-download"
          outlined
          severity="secondary"
          :loading="csvDownloading"
          :disabled="csvImporting"
          @click="downloadPlayersCsv"
        />
        <Button
          label="Загрузить CSV"
          icon="pi pi-upload"
          outlined
          severity="secondary"
          :loading="csvImporting"
          :disabled="csvDownloading"
          @click="triggerCsvImport"
        />
        <input
          ref="csvFileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          @change="onCsvFileChange"
        />
        <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
      </div>
    </header>

    <div
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end"
    >
      <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
        <InputText
          v-model="filters.name"
          class="w-full"
        />
        <label>Имя или фамилия</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
        <Select
          v-model="filters.position"
          :options="positionFilterOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <label>Амплуа</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
        <Select
          v-model="filters.teamId"
          :options="listFilterTeamSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          panel-class="player-list-team-filter-panel"
          :loading="listFilterTeamsLoading"
          filter
          filter-placeholder="Поиск команды (сервер)"
          reset-filter-on-hide
          @show="onListFilterTeamSelectPanelShow"
          @hide="onListFilterTeamSelectPanelHide"
          @filter="onListFilterTeamSelectFilter"
        >
          <template #footer>
            <div
              v-if="listFilterTeamsHasMore || listFilterTeamsLoadingMore"
              class="px-2 py-2 border-t border-surface-200 text-center text-xs text-muted-color"
            >
              <span v-if="listFilterTeamsLoadingMore">Загрузка…</span>
              <span v-else>Прокрутите список вниз, чтобы подгрузить ещё</span>
            </div>
          </template>
        </Select>
        <label>Команда</label>
      </FloatLabel>
      <FloatLabel variant="on" class="min-w-0 sm:col-span-2 xl:col-span-4">
        <DatePicker
          v-model="filters.birthDateRange"
          class="w-full"
          dateFormat="yy-mm-dd"
          showIcon
          selectionMode="range"
          placeholder="Дата рождения: от — до"
        />
        <label>Дата рождения</label>
      </FloatLabel>

      <div class="flex justify-end pt-1 sm:col-span-2 xl:col-span-12">
        <Button label="Сбросить фильтры" text severity="secondary" @click="resetFilters" />
      </div>
    </div>

    <DataTable
      :value="players"
      :loading="loading"
      stripedRows
      :paginator="totalPlayers >= 6"
      lazy
      :totalRecords="totalPlayers"
      :first="first"
      :rows="pageSize"
      :rowsPerPageOptions="[5, 10, 20, 50]"
      @page="onPlayersPage"
      @sort="onPlayersSort"
      responsiveLayout="scroll"
    >
      <template #empty>
        <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted-color">
          <i class="pi pi-inbox text-4xl opacity-40" aria-hidden="true" />
          <span class="text-sm font-medium text-surface-700">Нет игроков</span>
          <span class="text-xs text-center max-w-sm">
            Измените фильтры или добавьте игрока кнопкой «Создать».
          </span>
        </div>
      </template>
      <Column field="lastName" header="Игрок" sortable style="min-width: 14rem">
        <template #body="{ data }">
          <div class="flex items-center gap-3 min-w-0">
            <span
              v-if="data.bioNumber"
              class="text-xs font-semibold text-muted-color tabular-nums shrink-0 w-10 text-center"
            >
              №{{ data.bioNumber }}
            </span>
            <img
              v-if="data.photoUrl"
              :src="data.photoUrl"
              :alt="`${data.firstName} ${data.lastName}`"
              class="w-10 h-10 shrink-0 rounded-lg object-cover border border-surface-200 bg-surface-0"
            />
            <div
              v-else
              class="w-10 h-10 shrink-0 rounded-lg border border-surface-200 bg-surface-100 flex items-center justify-center text-muted-color"
              aria-hidden="true"
            >
              <i class="pi pi-user text-lg opacity-50" />
            </div>
            <span class="font-medium text-surface-900 truncate min-w-0">
              {{ data.firstName }} {{ data.lastName }}
            </span>
          </div>
        </template>
      </Column>
      <Column header="Команда" style="min-width: 11rem">
        <template #body="{ data }">
          <div v-if="data.team" class="flex items-center gap-2 min-w-0">
            <img
              v-if="data.team.logoUrl"
              :src="data.team.logoUrl"
              alt=""
              class="w-8 h-8 shrink-0 rounded-md object-cover border border-surface-200 bg-surface-0"
            />
            <div
              v-else
              class="w-8 h-8 shrink-0 rounded-md border border-surface-200 bg-surface-100 flex items-center justify-center text-muted-color"
              aria-hidden="true"
            >
              <i class="pi pi-users text-sm opacity-50" />
            </div>
            <span class="text-sm truncate">{{ data.team.name }}</span>
          </div>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column field="birthDate" header="Дата рождения" sortable>
        <template #body="{ data }">
          <span v-if="data.birthDate">{{ new Date(data.birthDate).toLocaleDateString() }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column field="position" header="Амплуа" sortable>
        <template #body="{ data }">
          <span v-if="data.position">{{ data.position }}</span>
          <span v-else class="text-muted-color">—</span>
        </template>
      </Column>
      <Column header="Действия" style="width: 8rem">
        <template #body="{ data }">
          <div class="flex gap-2 justify-end">
            <Button icon="pi pi-pencil" text size="small" @click="openEdit(data)" aria-label="Редактировать" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deletePlayer(data)" aria-label="Удалить" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактирование игрока' : 'Создание игрока'"
      :style="{ width: '54rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="md:col-span-1 flex items-stretch relative">
          <button
            type="button"
            class="w-full h-full min-h-44 overflow-hidden rounded-xl border border-surface-200 bg-surface-0 flex items-center justify-center relative leading-none"
            :class="
              photoUploading || photoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer'
            "
            :disabled="photoUploading || photoRemoving"
            @click="triggerPhotoPick"
            aria-label="Загрузить или заменить фото игрока"
          >
            <img
              v-if="form.photoUrl && !photoUploading && !photoRemoving"
              :src="form.photoUrl"
              alt="Фото игрока"
              class="absolute inset-0 w-full h-full object-cover"
            />
            <div
              v-else-if="!photoUploading && !photoRemoving"
              class="relative flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
            >
              <i class="pi pi-image text-2xl opacity-60" aria-hidden="true" />
              <span class="text-xs">Нажми, чтобы загрузить фото</span>
            </div>
            <div
              v-if="photoUploading || photoRemoving"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-0/90 text-sm text-surface-700"
            >
              <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
              <span>{{ photoRemoving ? 'Удаление…' : 'Загрузка…' }}</span>
            </div>
          </button>

          <Button
            v-if="form.photoUrl && !photoUploading && !photoRemoving"
            type="button"
            icon="pi pi-trash"
            rounded
            severity="danger"
            text
            class="!absolute top-2 right-2 z-10 !h-9 !w-9 !min-w-9 shadow-sm bg-surface-0/90 hover:!bg-surface-0"
            aria-label="Удалить фото"
            @click="removePlayerPhoto"
          />

          <input
            ref="photoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onPhotoFileChange"
          />
        </div>
        <div class="space-y-4 md:col-span-2">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatLabel variant="on" class="block">
              <InputText v-model="form.lastName" class="w-full" />
              <label>Фамилия</label>
            </FloatLabel>
            <FloatLabel variant="on" class="block">
              <InputText v-model="form.firstName" class="w-full" />
              <label>Имя</label>
            </FloatLabel>
          </div>
          <FloatLabel variant="on" class="block">
            <DatePicker v-model="form.birthDate" class="w-full" dateFormat="yy-mm-dd" showIcon />
            <label>Дата рождения</label>
          </FloatLabel>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatLabel variant="on" class="block">
              <Select
                v-model="form.position"
                :options="positionOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label>Амплуа</label>
            </FloatLabel>

            <FloatLabel variant="on" class="block">
              <InputText v-model="form.bioNumber" class="w-full" />
              <label>Номер игрока</label>
            </FloatLabel>
          </div>

          <FloatLabel variant="on" class="block">
            <InputText v-model="form.phone" class="w-full" />
            <label>Мобильный телефон</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <Select
              v-model="form.teamId"
              :options="teamSelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              panel-class="player-team-select-panel"
              :loading="teamsLoading"
              filter
              filter-placeholder="Поиск по названию (сервер)"
              reset-filter-on-hide
              @show="onTeamSelectPanelShow"
              @hide="onTeamSelectPanelHide"
              @filter="onTeamSelectFilter"
            >
              <template #footer>
                <div
                  v-if="teamsHasMore || teamsLoadingMore"
                  class="px-2 py-2 border-t border-surface-200 text-center text-xs text-muted-color"
                >
                  <span v-if="teamsLoadingMore">Загрузка…</span>
                  <span v-else>Прокрутите список вниз, чтобы подгрузить ещё</span>
                </div>
              </template>
            </Select>
            <label>Команда</label>
          </FloatLabel>
        </div>

        <div class="md:col-span-3">
          <FloatLabel variant="on" class="block">
            <Textarea v-model="form.biography" class="w-full" rows="6" />
            <label>Биография</label>
          </FloatLabel>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button :label="isEdit ? 'Сохранить' : 'Создать'" icon="pi pi-check" :loading="saving" @click="savePlayer" />
        </div>
      </template>
    </Dialog>
  </section>
</template>


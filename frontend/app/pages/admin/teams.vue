<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { useTenantTeamLogo } from '~/composables/useTenantTeamLogo'
import { PLAYER_POSITION_OPTIONS } from '~/constants/playerPositions'
import type { TeamPlayerRow, TeamRow } from '~/types/admin/team'
import { toYmdLocal as toYmd } from '~/utils/dateYmd'
import { slugifyFromTitle } from '~/utils/slugify'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const tenantId = useTenantId()

const loading = ref(false)
const teams = ref<TeamRow[]>([])
const pageSize = ref(10)
const first = ref(0)
const totalTeams = ref(0)
const currentPage = ref(1)
const searchQuery = ref('')
const sortField = ref<string | null>(null)
const sortOrder = ref<number | null>(null)
const teamCategoryOptions = ref<Array<{ label: string; value: string }>>([])
const categoriesLoading = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const showForm = ref(false)
const saving = ref(false)
const editing = ref<TeamRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  category: '',
  logoUrl: '',
  coachName: '',
  coachPhone: '',
  coachEmail: '',
  contactName: '',
  contactPhone: '',
  description: '',
})

/** Slug в API всегда из названия (как на публичных URL). */
const teamSlugGenerated = computed(() => slugifyFromTitle(form.name, 'team'))

const fetchTeams = async (page: number = 1, size: number = pageSize.value, nameQuery: string = searchQuery.value) => {
  if (!token.value) return
  loading.value = true
  const pageNum = Math.max(1, Math.floor(Number(page) || 1))
  const pageSizeNum = Math.max(1, Math.floor(Number(size) || pageSize.value || 10))
  try {
    const res = await authFetch<{ items: TeamRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          page: pageNum,
          pageSize: pageSizeNum,
          ...(nameQuery ? { name: nameQuery } : {}),
          ...(sortField.value ? { sortField: sortField.value } : {}),
          ...(sortOrder.value === 1 || sortOrder.value === -1 ? { sortOrder: sortOrder.value } : {}),
        },
      },
    )
    teams.value = res.items
    totalTeams.value = res.total
  } finally {
    loading.value = false
  }
}

const {
  logoFileInput,
  logoUploading,
  logoRemoving,
  triggerLogoPick,
  onLogoFileChange,
  removeTeamLogo,
} = useTenantTeamLogo({
  form,
  isEdit,
  editingTeamId: () => editing.value?.id ?? null,
  tenantId,
  token,
  authFetch,
  apiUrl,
  toast,
  onAfterPersist: async () => {
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
  },
})

const fetchTeamCategories = async () => {
  if (!token.value) return
  categoriesLoading.value = true
  try {
    const res = await authFetch<Array<{ id: string; name: string; slug?: string | null }>>(
      apiUrl(`/tenants/${tenantId.value}/team-categories`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    teamCategoryOptions.value = res.map((c) => ({ label: c.name, value: c.name }))
  } finally {
    categoriesLoading.value = false
  }
}

const teamCategorySelectOptions = computed(() => {
  const value = form.category?.trim() || ''
  if (!value) return teamCategoryOptions.value
  if (teamCategoryOptions.value.some((o) => o.value === value)) return teamCategoryOptions.value
  return [{ label: value, value }, ...teamCategoryOptions.value]
})

const positionOptions = [...PLAYER_POSITION_OPTIONS]

watch(searchQuery, (v) => {
  // Debounce чтобы не дергать сервер на каждом символе
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    currentPage.value = 1
    first.value = 0
    fetchTeams(1, pageSize.value, v)
  }, 300)
})

const openCreate = () => {
  editing.value = null
  form.name = ''
  form.category = ''
  form.logoUrl = ''
  form.coachName = ''
  form.coachPhone = ''
  form.coachEmail = ''
  form.contactName = ''
  form.contactPhone = ''
  form.description = ''
  showForm.value = true
}

const openEdit = (t: TeamRow) => {
  editing.value = t
  form.name = t.name
  form.category = t.category ?? ''
  form.logoUrl = t.logoUrl ?? ''
  form.coachName = t.coachName ?? ''
  form.coachPhone = ''
  form.coachEmail = ''
  form.contactName = ''
  form.contactPhone = ''
  form.description = ''
  showForm.value = true
}

const saveTeam = async () => {
  if (!token.value) return
  saving.value = true
  try {
    const body: any = {
      name: form.name,
      slug: teamSlugGenerated.value,
      category: form.category || undefined,
      logoUrl: form.logoUrl || undefined,
      coachName: form.coachName || undefined,
      coachPhone: form.coachPhone || undefined,
      coachEmail: form.coachEmail || undefined,
      contactName: form.contactName || undefined,
      contactPhone: form.contactPhone || undefined,
      description: form.description || undefined,
    }

    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/teams`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
    }

    showForm.value = false
    await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
  } finally {
    saving.value = false
  }
}

const deleteTeam = async (t: TeamRow) => {
  if (!token.value) return
  if (!confirm(`Удалить команду "${t.name}"?`)) return
  await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${t.id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token.value}` },
  })
  await fetchTeams(currentPage.value, pageSize.value, searchQuery.value)
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  currentPage.value = 1
  fetchTeamCategories()
  fetchTeams(1, pageSize.value, searchQuery.value)
})

const onTeamsPage = (event: any) => {
  // Для PrimeVue `first` — индекс первой строки (0-based), `rows` — размер страницы.
  // Поэтому страницу считаем как: floor(first / rows) + 1 (1-based для бэка).
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? pageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : pageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  pageSize.value = nextSize
  first.value = nextFirst
  currentPage.value = nextPage

  fetchTeams(nextPage, nextSize, searchQuery.value)
}

const onTeamsSort = (event: any) => {
  const nextField = typeof event.sortField === 'string' ? event.sortField : null
  const nextOrder = event.sortOrder === 1 || event.sortOrder === -1 ? event.sortOrder : null

  // Разрешаем только то, что поддерживает бэк.
  sortField.value = nextField === 'name' || nextField === 'playersCount' ? nextField : null
  sortOrder.value = nextOrder

  currentPage.value = 1
  first.value = 0
  fetchTeams(1, pageSize.value, searchQuery.value)
}

const rosterOpen = ref(false)
const rosterTeam = ref<TeamRow | null>(null)
const rosterPlayers = ref<TeamPlayerRow[]>([])
const rosterTotal = ref(0)
const rosterLoading = ref(false)

const rosterPageSize = ref(10)
const rosterFirst = ref(0)
const rosterCurrentPage = ref(1)

const rosterSortField = ref<string | null>(null)
const rosterSortOrder = ref<number | null>(null)

/** Как на странице «Игроки»: одно поле имени, селект амплуа, диапазон дат рождения */
const rosterFilters = reactive({
  name: '',
  position: '',
  phone: '',
  birthDateRange: null as Date[] | null,
})

const rosterPositionFilterOptions = computed(() => [
  { value: '', label: 'Все амплуа' },
  ...PLAYER_POSITION_OPTIONS,
])

let rosterFilterDebounce: ReturnType<typeof setTimeout> | null = null

function clearRosterFilterDebounce() {
  if (rosterFilterDebounce) {
    clearTimeout(rosterFilterDebounce)
    rosterFilterDebounce = null
  }
}

function scheduleRosterFilterFetch() {
  if (!rosterOpen.value || !rosterTeam.value) return
  clearRosterFilterDebounce()
  rosterFilterDebounce = setTimeout(() => {
    rosterFilterDebounce = null
    rosterCurrentPage.value = 1
    rosterFirst.value = 0
    void fetchRosterPlayers()
  }, 350)
}

const hasActiveRosterFilters = computed(() => {
  const br = rosterFilters.birthDateRange
  const hasRange = !!(br && br.length >= 2 && br[0] && br[1])
  return !!(
    rosterFilters.name.trim() ||
    rosterFilters.position.trim() ||
    rosterFilters.phone.trim() ||
    hasRange
  )
})

watch(
  () =>
    [
      rosterOpen.value,
      rosterTeam.value?.id,
      rosterFilters.name,
      rosterFilters.position,
      rosterFilters.phone,
      rosterFilters.birthDateRange,
    ] as const,
  () => {
    if (!rosterOpen.value || !rosterTeam.value) return
    scheduleRosterFilterFetch()
  },
  { deep: true },
)

const fetchRosterPlayers = async () => {
  if (!token.value || !rosterTeam.value) return
  rosterLoading.value = true
  const page = Math.max(1, Math.floor(Number(rosterCurrentPage.value) || 1))
  const size = Math.max(1, Math.floor(Number(rosterPageSize.value) || 10))

  try {
    const params: Record<string, unknown> = {
      page,
      pageSize: size,
    }
    if (rosterSortField.value) params.sortField = rosterSortField.value
    if (rosterSortOrder.value === 1 || rosterSortOrder.value === -1) params.sortOrder = rosterSortOrder.value

    if (rosterFilters.name.trim()) params.name = rosterFilters.name.trim()
    if (rosterFilters.position.trim()) params.position = rosterFilters.position.trim()
    if (rosterFilters.phone.trim()) params.phone = rosterFilters.phone.trim()
    const br = rosterFilters.birthDateRange
    if (br && br.length >= 2 && br[0] && br[1]) {
      const a = br[0]
      const b = br[1]
      const from = a <= b ? a : b
      const to = a <= b ? b : a
      params.birthDateFrom = toYmd(from)
      params.birthDateTo = toYmd(to)
    }

    const res = await authFetch<{ items: TeamPlayerRow[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params,
      },
    )
    rosterPlayers.value = res.items
    rosterTotal.value = res.total
  } finally {
    rosterLoading.value = false
  }
}

const onRosterPage = (event: any) => {
  const nextFirst = Number(event.first ?? 0)
  const nextSizeCandidate = Number(event.rows ?? rosterPageSize.value)
  const nextSize = nextSizeCandidate > 0 ? nextSizeCandidate : rosterPageSize.value
  const nextPage = Math.floor(nextFirst / nextSize) + 1

  rosterFirst.value = nextFirst
  rosterPageSize.value = nextSize
  rosterCurrentPage.value = nextPage
  fetchRosterPlayers()
}

/** Сортировка на сервере; поле/порядок синхронизируются через v-model на DataTable */
const onRosterSort = () => {
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  void fetchRosterPlayers()
}

const resetRosterFilters = () => {
  clearRosterFilterDebounce()
  rosterFilters.name = ''
  rosterFilters.position = ''
  rosterFilters.phone = ''
  rosterFilters.birthDateRange = null
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  void fetchRosterPlayers()
  void nextTick(() => clearRosterFilterDebounce())
}

const openRoster = async (team: TeamRow) => {
  clearRosterFilterDebounce()
  rosterTeam.value = team
  rosterOpen.value = true
  rosterCurrentPage.value = 1
  rosterFirst.value = 0
  rosterSortField.value = null
  rosterSortOrder.value = null
  rosterFilters.name = ''
  rosterFilters.position = ''
  rosterFilters.phone = ''
  rosterFilters.birthDateRange = null
  await fetchRosterPlayers()
  await nextTick(() => clearRosterFilterDebounce())
}

const rosterEditorOpen = ref(false)
const rosterEditorMode = ref<'create' | 'edit'>('create')

const editorPlayerId = ref<string | null>(null)
const editorJerseyNumber = ref<number | null>(null)
const editorPosition = ref<string>('')

const editorPickQuery = ref('')
const editorPickLoading = ref(false)
const editorPickOptions = ref<Array<{ label: string; value: string }>>([])

const fetchPickPlayers = async () => {
  if (!token.value || !rosterTeam.value) return
  editorPickLoading.value = true
  try {
    const res = await authFetch<{ items: Array<{ id: string; firstName: string; lastName: string }>; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/players`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          page: 1,
          pageSize: 50,
          ...(editorPickQuery.value.trim() ? { lastName: editorPickQuery.value.trim() } : {}),
        },
      },
    )
    editorPickOptions.value = res.items.map((p) => ({ label: `${p.lastName} ${p.firstName}`, value: p.id }))
  } finally {
    editorPickLoading.value = false
  }
}

const openAddRosterPlayer = async () => {
  rosterEditorMode.value = 'create'
  editorPlayerId.value = null
  editorJerseyNumber.value = null
  editorPosition.value = ''
  editorPickQuery.value = ''
  await fetchPickPlayers()
  rosterEditorOpen.value = true
}

const openEditRosterPlayer = (tp: TeamPlayerRow) => {
  rosterEditorMode.value = 'edit'
  editorPlayerId.value = tp.playerId
  editorJerseyNumber.value = tp.jerseyNumber
  editorPosition.value = tp.position ?? ''
  rosterEditorOpen.value = true
}

const saveRosterPlayer = async () => {
  if (!token.value || !rosterTeam.value || !editorPlayerId.value) return
  if (rosterEditorMode.value === 'create') {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        playerId: editorPlayerId.value,
        jerseyNumber: editorJerseyNumber.value ?? undefined,
        position: editorPosition.value || undefined,
      },
    })
  } else {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/${editorPlayerId.value}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          jerseyNumber: editorJerseyNumber.value ?? undefined,
          position: editorPosition.value || undefined,
        },
      },
    )
  }
  rosterEditorOpen.value = false
  await fetchRosterPlayers()
}

const deleteRosterPlayer = async (tp: TeamPlayerRow) => {
  if (!token.value || !rosterTeam.value) return
  if (!confirm(`Удалить игрока "${tp.player.lastName} ${tp.player.firstName}" из команды?`)) return
  await authFetch(
    apiUrl(`/tenants/${tenantId.value}/teams/${rosterTeam.value.id}/players/${tp.playerId}`),
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    },
  )
  await fetchRosterPlayers()
}
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900">Команды</h1>
        <p class="mt-1 text-sm text-muted-color">Справочник команд тенанта.</p>
      </div>
      <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
    </header>

    <div class="flex items-center gap-3">
      <InputText
        v-model="searchQuery"
        placeholder="Название команды"
        class="w-full md:w-72"
      />
      <Button
        v-if="searchQuery"
        text
        icon="pi pi-times"
        severity="secondary"
        size="small"
        @click="searchQuery = ''"
      />
    </div>

    <DataTable
      :value="teams"
      :loading="loading"
      stripedRows
      paginator
      lazy
      :totalRecords="totalTeams"
      :first="first"
      :rows="pageSize"
      :rowsPerPageOptions="[5, 10, 20, 50]"
      @page="onTeamsPage"
      @sort="onTeamsSort"
    >
      <Column header="" style="width: 5.5rem">
        <template #body="{ data }">
          <img
            v-if="data.logoUrl"
            :src="data.logoUrl"
            alt="Логотип"
            class="w-10 h-10 object-cover border border-surface-200 rounded bg-surface-0"
          />
          <div
            v-else
            class="w-10 h-10 border border-surface-200 rounded bg-surface-0 p-1"
            aria-label="Нет логотипа"
          />
        </template>
      </Column>
      <Column field="name" header="Название" sortable />
      <Column field="category" header="Категория" />
      <Column field="playersCount" header="Игроков" sortable>
        <template #body="{ data }">{{ data.playersCount }}</template>
      </Column>
      <Column header="Действия" style="width: 16rem">
        <template #body="{ data }">
          <div class="flex gap-2 justify-end w-full">
            <Button
              icon="pi pi-pencil"
              text
              size="small"
              @click="openEdit(data)"
              aria-label="Редактировать"
            />
            <Button
              icon="pi pi-users"
              text
              size="small"
              @click="openRoster(data)"
              aria-label="Игроки команды"
            />
            <Button
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="deleteTeam(data)"
              aria-label="Удалить"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать команду' : 'Создать команду'"
      :style="{ width: '44rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <!-- Left: placeholder for team picture -->
        <div class="md:col-span-1 flex items-stretch relative">
          <button
            type="button"
            class="w-full h-full min-h-28 overflow-hidden rounded-xl border border-surface-200 bg-surface-0 flex items-center justify-center relative leading-none"
            :class="
              logoUploading || logoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer'
            "
            :disabled="logoUploading || logoRemoving"
            @click="triggerLogoPick"
            aria-label="Загрузить или заменить логотип команды"
          >
            <img
              v-if="form.logoUrl && !logoUploading && !logoRemoving"
              :src="form.logoUrl"
              alt="Логотип"
              class="absolute inset-0 w-full h-full object-cover"
            />
            <div
              v-else-if="!logoUploading && !logoRemoving"
              class="relative flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
            >
              <i class="pi pi-image text-2xl opacity-60" aria-hidden="true" />
              <span class="text-xs">Нажми, чтобы загрузить логотип</span>
            </div>
            <div
              v-if="logoUploading || logoRemoving"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-0/90 text-sm text-surface-700"
            >
              <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
              <span>{{ logoRemoving ? 'Удаление…' : 'Загрузка…' }}</span>
            </div>
          </button>

          <Button
            v-if="form.logoUrl && !logoUploading && !logoRemoving"
            type="button"
            icon="pi pi-trash"
            rounded
            severity="danger"
            text
            class="!absolute top-2 right-2 z-10 !h-9 !w-9 !min-w-9 shadow-sm bg-surface-0/90 hover:!bg-surface-0"
            aria-label="Удалить логотип"
            @click="removeTeamLogo"
          />

          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoFileChange"
          />
        </div>

        <!-- Right: fields -->
        <div class="space-y-4 md:col-span-2">
          <FloatLabel variant="on" class="block">
            <InputText id="team_name" v-model="form.name" class="w-full" />
            <label for="team_name">Название</label>
          </FloatLabel>

          <p class="text-xs text-muted-color">
            Slug в URL формируется автоматически:
            <code class="ml-1 rounded bg-surface-100 px-1.5 py-0.5 font-mono text-surface-800">{{
              teamSlugGenerated
            }}</code>
          </p>

          <FloatLabel variant="on" class="block">
            <Select
              inputId="team_cat"
              v-model="form.category"
              :options="teamCategorySelectOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              :loading="categoriesLoading"
            />
            <label for="team_cat">Категория</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <InputText id="team_coach" v-model="form.coachName" class="w-full" />
            <label for="team_coach">Тренер (имя)</label>
          </FloatLabel>
        </div>

        <!-- Bottom: description -->
        <div class="md:col-span-3">
          <FloatLabel variant="on" class="block">
            <Textarea id="team_desc" v-model="form.description" class="w-full" rows="3" />
            <label for="team_desc">Описание</label>
          </FloatLabel>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button :label="isEdit ? 'Сохранить' : 'Создать'" icon="pi pi-check" :loading="saving" @click="saveTeam" />
        </div>
      </template>
    </Dialog>

    <Dialog
      :visible="rosterOpen"
      @update:visible="(v) => (rosterOpen = v)"
      modal
      :header="rosterTeam ? `Игроки команды: ${rosterTeam.name}` : 'Игроки команды'"
      :style="{ width: '74rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="space-y-4">
        <div
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end"
        >
          <FloatLabel variant="on" class="min-w-0 xl:col-span-3">
            <InputText v-model="rosterFilters.name" class="w-full" />
            <label>Имя или фамилия</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
            <Select
              v-model="rosterFilters.position"
              :options="rosterPositionFilterOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
            <label>Амплуа</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 xl:col-span-2">
            <InputText v-model="rosterFilters.phone" class="w-full" />
            <label>Телефон</label>
          </FloatLabel>
          <FloatLabel variant="on" class="min-w-0 sm:col-span-2 xl:col-span-5">
            <DatePicker
              v-model="rosterFilters.birthDateRange"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
              selectionMode="range"
              placeholder="Дата рождения: от — до"
            />
            <label>Дата рождения</label>
          </FloatLabel>

          <div class="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2 xl:col-span-12">
            <Button label="Сбросить фильтры" text severity="secondary" @click="resetRosterFilters" />
            <Button label="Добавить" icon="pi pi-plus" @click="openAddRosterPlayer" />
          </div>
        </div>

        <DataTable
          :value="rosterPlayers"
          :loading="rosterLoading"
          stripedRows
          :paginator="rosterTotal >= 6"
          lazy
          v-model:sortField="rosterSortField"
          v-model:sortOrder="rosterSortOrder"
          :totalRecords="rosterTotal"
          :first="rosterFirst"
          :rows="rosterPageSize"
          :rowsPerPageOptions="[5, 10, 20, 50]"
          responsiveLayout="scroll"
          @page="onRosterPage"
          @sort="onRosterSort"
        >
          <template #empty>
            <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted-color">
              <i class="pi pi-inbox text-4xl opacity-40" aria-hidden="true" />
              <span class="text-sm font-medium text-surface-700">
                <template v-if="hasActiveRosterFilters">Нет игроков по заданным фильтрам</template>
                <template v-else>В этой команде пока нет игроков</template>
              </span>
              <span class="text-xs text-center max-w-sm">
                <template v-if="hasActiveRosterFilters">
                  Измените фильтры или сбросьте их.
                </template>
                <template v-else>
                  Добавьте игрока кнопкой «Добавить».
                </template>
              </span>
            </div>
          </template>
          <Column
            field="jerseyNumber"
            header="№"
            sortable
            style="width: 5rem"
          >
            <template #body="{ data }">
              <span v-if="data.jerseyNumber != null" class="tabular-nums font-medium">{{ data.jerseyNumber }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="lastName" header="Игрок" sortable style="min-width: 14rem">
            <template #body="{ data }">
              <div class="flex items-center gap-3 min-w-0">
                <img
                  v-if="data.player.photoUrl"
                  :src="data.player.photoUrl"
                  :alt="`${data.player.firstName} ${data.player.lastName}`"
                  class="h-10 w-10 shrink-0 rounded-lg border border-surface-200 bg-surface-0 object-cover"
                />
                <div
                  v-else
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-surface-100 text-muted-color"
                  aria-hidden="true"
                >
                  <i class="pi pi-user text-lg opacity-50" />
                </div>
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-surface-900">
                    {{ data.player.firstName }} {{ data.player.lastName }}
                  </div>
                  <div v-if="data.player.birthDate" class="text-xs text-muted-color">
                    {{ new Date(data.player.birthDate).toLocaleDateString() }}
                  </div>
                  <div v-else class="text-xs text-muted-color">—</div>
                </div>
              </div>
            </template>
          </Column>
          <Column field="birthDate" header="Дата рождения" sortable style="min-width: 9rem">
            <template #body="{ data }">
              <span v-if="data.player.birthDate">{{ new Date(data.player.birthDate).toLocaleDateString() }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="position" header="Амплуа" sortable style="min-width: 8rem">
            <template #body="{ data }">
              <span v-if="data.position">{{ data.position }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column field="phone" header="Телефон" sortable style="min-width: 10rem">
            <template #body="{ data }">
              <span v-if="data.player.phone">{{ data.player.phone }}</span>
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column header="Действия" style="width: 8rem">
            <template #body="{ data }">
              <div class="flex w-full justify-end gap-2">
                <Button icon="pi pi-pencil" text size="small" @click="openEditRosterPlayer(data)" aria-label="Редактировать" />
                <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleteRosterPlayer(data)" aria-label="Удалить" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </Dialog>

    <Dialog
      :visible="rosterEditorOpen"
      @update:visible="(v) => (rosterEditorOpen = v)"
      modal
      :header="rosterEditorMode === 'edit' ? 'Редактировать игрока в команде' : 'Добавить игрока в команду'"
      :style="{ width: '44rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-if="rosterEditorMode === 'create'">
            <FloatLabel variant="on" class="block">
              <InputText v-model="editorPickQuery" class="w-full" placeholder="Поиск игрока по фамилии" />
              <label>Поиск</label>
            </FloatLabel>
            <Button
              label="Найти"
              icon="pi pi-search"
              text
              class="w-full mt-2"
              @click="fetchPickPlayers"
            />
          </div>

          <FloatLabel variant="on" class="block md:col-span-2" v-if="rosterEditorMode === 'create'">
            <Select
              v-model="editorPlayerId"
              :options="editorPickOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              placeholder="Выберите игрока"
            />
            <label>Игрок</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <InputNumber v-model="editorJerseyNumber" class="w-full" placeholder="№" :min="0" />
            <label>Номер игрока</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <Select
              v-model="editorPosition"
              :options="positionOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              placeholder="Выберите амплуа"
            />
            <label>Амплуа</label>
          </FloatLabel>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="rosterEditorOpen = false" />
          <Button
            :label="rosterEditorMode === 'edit' ? 'Сохранить' : 'Добавить'"
            icon="pi pi-check"
            :loading="saving"
            @click="saveRosterPlayer"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>


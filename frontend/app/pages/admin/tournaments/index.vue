<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  TournamentDetails,
  TournamentFormat,
  TournamentRow,
  TournamentStatus,
  UserLite,
} from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import { getApiErrorMessage } from '~/utils/apiError'
import { slugifyFromTitle } from '~/utils/slugify'
import { computed, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()

const tenantId = useTenantId()

const loading = ref(false)
const tournaments = ref<TournamentRow[]>([])

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)
const initialTeamIds = ref<string[]>([])

const logoFileInput = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)

const triggerLogoPick = () => {
  if (logoUploading.value) return
  logoFileInput.value?.click()
}

const onLogoFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return
  if (!token.value) {
    toast.add({
      severity: 'warn',
      summary: 'Нужна авторизация',
      detail: 'Войдите снова и повторите загрузку.',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

  if (!file.type.startsWith('image/')) {
    toast.add({
      severity: 'warn',
      summary: 'Неверный тип файла',
      detail: 'Выберите изображение (JPEG, PNG, WebP и т.д.).',
      life: 4000,
    })
    if (target) target.value = ''
    return
  }

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

  logoUploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await authFetch<{ key: string; url: string }>(apiUrl('/upload?folder=tournaments'), {
      method: 'POST',
      body,
    })
    const imageUrl = res.url
    form.logoUrl = imageUrl

    // Уже существующий турнир — сразу пишем logoUrl в API
    if (editingId.value) {
      try {
        await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
          method: 'PATCH',
          body: { logoUrl: imageUrl },
        })
        await fetchTournaments()
        toast.add({
          severity: 'success',
          summary: 'Логотип загружен и сохранён',
          life: 3000,
        })
      } catch (patchErr: unknown) {
        toast.add({
          severity: 'warn',
          summary: 'Файл загружен, но ссылка не записана в турнир',
          detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
          life: 7000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Логотип загружен',
        detail: 'Нажми «Создать», чтобы сохранить турнир.',
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
    logoUploading.value = false
    if (target) target.value = ''
  }
}

const logoRemoving = ref(false)

const removeTournamentLogo = async (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
  if (!form.logoUrl || logoUploading.value || logoRemoving.value) return

  form.logoUrl = ''

  if (editingId.value && token.value) {
    logoRemoving.value = true
    try {
      await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
        method: 'PATCH',
        body: { logoUrl: null },
      })
      await fetchTournaments()
      toast.add({
        severity: 'success',
        summary: 'Логотип удалён',
        life: 2500,
      })
    } catch (err: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось убрать логотип',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      logoRemoving.value = false
    }
  }
}

const teamsLoading = ref(false)
const teams = ref<TeamLite[]>([])

const fallbackTeams = Array.from({ length: 20 }).map((_, i) => ({
  id: `team-${i + 1}`,
  name: `Команда ${i + 1}`,
}))

const formatOptions = [
  { value: 'SINGLE_GROUP', label: 'Единая группа (круговой турнир)' },
  { value: 'GROUPS_2', label: '2 группы + плей-офф' },
  { value: 'GROUPS_3', label: '3 группы + плей-офф' },
  { value: 'GROUPS_4', label: '4 группы + плей-офф' },
  { value: 'PLAYOFF', label: 'Сразу плей-офф (олимпийка)' },
  { value: 'GROUPS_PLUS_PLAYOFF', label: 'Группы + плей-офф (кастом)' },
]

const statusOptions = [
  { value: 'DRAFT', label: 'Черновик' },
  { value: 'ACTIVE', label: 'Активный' },
  { value: 'ARCHIVED', label: 'Архивный' },
]

const dayOptions = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
]

const adminsLoading = ref(false)
const users = ref<UserLite[]>([])

const form = reactive({
  name: '',
  description: '',
  logoUrl: '',
  format: 'SINGLE_GROUP' as TournamentFormat,
  groupCount: 1,
  playoffQualifiersPerGroup: 2,
  status: 'DRAFT' as TournamentStatus,
  startsAt: null as Date | null,
  endsAt: null as Date | null,
  intervalDays: 7,
  allowedDays: [6, 0] as number[],
  minTeams: 6,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  adminIds: [] as string[],
  teamIds: [] as string[],
})

const tournamentSlugGenerated = computed(() => slugifyFromTitle(form.name, 'tournament'))

const impliedGroupCount = computed<number | null>(() => {
  switch (form.format) {
    case 'SINGLE_GROUP':
      return 1
    case 'GROUPS_2':
      return 2
    case 'GROUPS_3':
      return 3
    case 'GROUPS_4':
      return 4
    case 'PLAYOFF':
      return 0
    default:
      return null // GROUPS_PLUS_PLAYOFF: allow manual groupCount (кастом)
  }
})

const groupCountMin = computed(() => (impliedGroupCount.value === null ? 1 : impliedGroupCount.value))
const groupCountMax = computed(() => (impliedGroupCount.value === null ? 8 : impliedGroupCount.value))

watch(
  () => form.format,
  () => {
    const implied = impliedGroupCount.value
    if (implied !== null) {
      form.groupCount = implied
    }
  },
  { immediate: true },
)

const fetchTournaments = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const res = await authFetch<TournamentRow[]>(
      apiUrl(`/tenants/${tenantId.value}/tournaments`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    tournaments.value = res
  } finally {
    loading.value = false
  }
}

const fetchUsersLite = async () => {
  if (!token.value) return
  adminsLoading.value = true
  try {
    const res = await authFetch<{ items: UserLite[]; total: number }>(apiUrl('/users'), {
      params: { page: 1, pageSize: 200 },
      headers: { Authorization: `Bearer ${token.value}` },
    })
    users.value = res.items.filter((u) => !u.blocked)
  } finally {
    adminsLoading.value = false
  }
}

const fetchTeamsLite = async () => {
  if (!token.value) return
  teamsLoading.value = true
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
      headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    teams.value = res.items
  } catch {
    teams.value = []
  } finally {
    teamsLoading.value = false
  }
}

const openCreate = async () => {
  editingId.value = null
  initialTeamIds.value = []
  form.name = ''
  form.description = ''
  form.logoUrl = ''
  form.format = 'SINGLE_GROUP'
  form.groupCount = 1
  form.playoffQualifiersPerGroup = 2
  form.status = 'DRAFT'
  form.startsAt = null
  form.endsAt = null
  form.intervalDays = 7
  form.allowedDays = [6, 0]
  form.minTeams = 6
  form.pointsWin = 3
  form.pointsDraw = 1
  form.pointsLoss = 0
  form.adminIds = []
  form.teamIds = []
  showForm.value = true
  if (!users.value.length) await fetchUsersLite()
  if (!teams.value.length) await fetchTeamsLite()
}

const openEdit = async (t: TournamentRow) => {
  if (!token.value) return
  editingId.value = t.id
  saving.value = true
  try {
    const res = await authFetch<TournamentDetails>(apiUrl(`/tournaments/${t.id}`), {
      headers: { Authorization: `Bearer ${token.value}` },
    })

    form.name = res.name
    form.description = res.description ?? ''
    form.logoUrl = res.logoUrl ?? ''
    form.format = res.format
    form.groupCount = (res.groupCount ?? 1) as number
    form.playoffQualifiersPerGroup = (res as any).playoffQualifiersPerGroup ?? 2
    form.status = res.status
    form.startsAt = res.startsAt ? new Date(res.startsAt) : null
    form.endsAt = res.endsAt ? new Date(res.endsAt) : null
    form.intervalDays = res.intervalDays ?? 7
    form.allowedDays = Array.isArray(res.allowedDays) ? res.allowedDays : []
    form.minTeams = res.minTeams ?? 2
    form.pointsWin = res.pointsWin ?? 3
    form.pointsDraw = res.pointsDraw ?? 1
    form.pointsLoss = res.pointsLoss ?? 0
    form.adminIds = Array.isArray(res.members) ? res.members.map((m) => m.userId) : []

    const anyRes: any = res as any
    const ids = Array.isArray(anyRes.tournamentTeams)
      ? anyRes.tournamentTeams.map((x: any) => x.teamId).filter(Boolean)
      : []
    form.teamIds = ids
    initialTeamIds.value = [...ids]

    showForm.value = true
    if (!users.value.length) await fetchUsersLite()
    if (!teams.value.length) await fetchTeamsLite()
  } finally {
    saving.value = false
  }
}

const toDateString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined)

const syncTournamentTeams = async (tournamentId: string) => {
  if (!token.value) return
  const next = new Set(form.teamIds)
  const prev = new Set(initialTeamIds.value)
  const toAdd = [...next].filter((id) => !prev.has(id))
  const toRemove = [...prev].filter((id) => !next.has(id))

  for (const teamId of toAdd) {
    if (teamId.startsWith('team-')) continue
    await authFetch(apiUrl(`/tournaments/${tournamentId}/teams/${teamId}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }
  for (const teamId of toRemove) {
    if (teamId.startsWith('team-')) continue
    await authFetch(apiUrl(`/tournaments/${tournamentId}/teams/${teamId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  initialTeamIds.value = [...form.teamIds]
}

const saveTournament = async () => {
  if (!token.value) return
  saving.value = true
  try {
    const body = {
      name: form.name,
      slug: tournamentSlugGenerated.value,
      description: form.description || undefined,
      logoUrl: form.logoUrl || undefined,
      format: form.format,
      groupCount: form.groupCount,
      playoffQualifiersPerGroup: form.playoffQualifiersPerGroup,
      status: form.status,
      startsAt: toDateString(form.startsAt),
      endsAt: toDateString(form.endsAt),
      intervalDays: form.intervalDays,
      allowedDays: form.allowedDays,
      minTeams: form.minTeams,
      pointsWin: form.pointsWin,
      pointsDraw: form.pointsDraw,
      pointsLoss: form.pointsLoss,
      admins: form.adminIds.map((id) => ({ userId: id })),
    }

    let id: string
    if (isEdit.value) {
      await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
      id = editingId.value!
    } else {
      const created = await authFetch<{ id: string }>(apiUrl(`/tenants/${tenantId.value}/tournaments`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body,
      })
      id = created.id
      editingId.value = created.id
    }

    await syncTournamentTeams(id)
    showForm.value = false
    await fetchTournaments()
  } finally {
    saving.value = false
  }
}

const deleteTournament = async (t: TournamentRow) => {
  if (!token.value) return
  if (!confirm(`Удалить турнир "${t.name}"?`)) return
  await authFetch(apiUrl(`/tournaments/${t.id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token.value}` },
  })
  await fetchTournaments()
}

const goToTournament = (t: TournamentRow) => {
  router.push(`/admin/tournaments/${t.id}`)
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  fetchTournaments()
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900">Турниры</h1>
        <p class="mt-1 text-sm text-muted-color">
          Создание турнира, настройка календаря и управление командами.
        </p>
      </div>
      <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
    </header>

    <div v-if="loading" class="text-sm text-muted-color">Загрузка...</div>
    <div v-else class="space-y-3">
      <div
        v-for="t in tournaments"
        :key="t.id"
        class="rounded-xl border border-surface-200 bg-surface-0 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-5">
            <div
              class="w-40 h-40 shrink-0 rounded-xl border border-surface-200 bg-surface-100 overflow-hidden"
            >
            <img
              v-if="t.logoUrl"
              :src="t.logoUrl"
              alt="Логотип"
              class="block h-full w-full object-cover"
            />
            <div v-else class="h-full w-full" aria-label="Нет логотипа"></div>
          </div>

          <div class="min-w-0">
            <button class="text-primary hover:underline text-left" @click="goToTournament(t)">
              <div class="text-base font-medium truncate">{{ t.name || 'Открыть турнир' }}</div>
            </button>
            <div class="text-xs text-muted-color">/{{ t.slug }}</div>

            <div class="mt-3 space-y-2 text-sm">
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Формат</div>
                <div class="font-medium">{{ t.format }}</div>
              </div>
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Статус</div>
                <div class="font-medium">{{ t.status }}</div>
              </div>
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Команд</div>
                <div class="font-medium">{{ t.teamsCount }}</div>
              </div>
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Даты</div>
                <div class="font-medium">
                  <span v-if="t.startsAt">{{ new Date(t.startsAt).toLocaleDateString() }}</span>
                  <span v-else class="text-muted-color">—</span>
                  <span class="text-muted-color"> → </span>
                  <span v-if="t.endsAt">{{ new Date(t.endsAt).toLocaleDateString() }}</span>
                  <span v-else class="text-muted-color">—</span>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div class="flex flex-col gap-2 shrink-0 items-end">
            <Button icon="pi pi-external-link" text size="small" @click="goToTournament(t)" aria-label="Открыть" />
            <Button icon="pi pi-pencil" text size="small" @click="openEdit(t)" aria-label="Редактировать" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleteTournament(t)" aria-label="Удалить" />
          </div>
        </div>
      </div>

      <div v-if="!tournaments.length" class="text-sm text-muted-color">
        Пока нет турниров.
      </div>
    </div>

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать турнир' : 'Создать турнир'"
      :style="{ width: '44rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- Left: превью логотипа -->
        <div class="md:col-span-1 h-full relative">
          <button
            type="button"
            class="w-full h-full min-h-[10rem] overflow-hidden rounded-xl border border-surface-200 bg-surface-0 flex items-center justify-center relative leading-none"
            :class="
              logoUploading || logoRemoving
                ? 'cursor-wait opacity-80'
                : 'cursor-pointer'
            "
            :disabled="logoUploading || logoRemoving"
            @click="triggerLogoPick"
            aria-label="Загрузить или заменить картинку турнира"
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
              <i class="pi pi-image text-3xl opacity-60" aria-hidden="true" />
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
            @click="removeTournamentLogo"
          />

          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onLogoFileChange"
          />
        </div>

        <!-- Right: title + dates -->
        <div class="space-y-4 md:col-span-1">
          <FloatLabel variant="on" class="block">
            <InputText id="t_name" v-model="form.name" class="w-full" />
            <label for="t_name">Название</label>
          </FloatLabel>

          <p class="text-xs text-muted-color">
            Slug в URL формируется автоматически:
            <code class="ml-1 rounded bg-surface-100 px-1.5 py-0.5 font-mono text-surface-800">{{
              tournamentSlugGenerated
            }}</code>
          </p>

          <FloatLabel variant="on" class="block">
            <DatePicker
              inputId="t_startsAt"
              v-model="form.startsAt"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
            />
            <label for="t_startsAt">Начало</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <DatePicker
              inputId="t_endsAt"
              v-model="form.endsAt"
              class="w-full"
              dateFormat="yy-mm-dd"
              showIcon
            />
            <label for="t_endsAt">Окончание</label>
          </FloatLabel>

          <FloatLabel variant="on" class="block">
            <Select
              inputId="t_status"
              v-model="form.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
            <label for="t_status">Статус</label>
          </FloatLabel>
        </div>

        <div class="md:col-span-2">
          <FloatLabel variant="on" class="block">
            <Textarea id="t_desc" v-model="form.description" class="w-full" rows="3" />
            <label for="t_desc">Описание</label>
          </FloatLabel>
        </div>

        <FloatLabel variant="on" class="block">
          <Select
            inputId="t_format"
            v-model="form.format"
            :options="formatOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <label for="t_format">Формат</label>
        </FloatLabel>

        <div>
          <FloatLabel variant="on" class="block">
            <InputNumber
              inputId="t_groupCount"
              v-model="form.groupCount"
              class="w-full"
              :min="groupCountMin"
              :max="groupCountMax"
              :readonly="impliedGroupCount !== null"
            />
            <label for="t_groupCount" class="flex items-center gap-2">
              Кол-во групп
              <span
                class="text-muted-color cursor-help select-none"
                :title="
                  impliedGroupCount === null
                    ? 'Кастомный формат: можно ввести количество групп 1..8. Для генерации потребуется минимум 2 команды на группу.'
                    : impliedGroupCount === 0
                      ? 'PLAYOFF: группы не используются (олимпийка).'
                      : `Для выбранного формата количество групп фиксировано: ${impliedGroupCount}.`
                "
              >
                ?
              </span>
            </label>
          </FloatLabel>
        </div>

        <div v-if="form.format !== 'SINGLE_GROUP' && form.format !== 'PLAYOFF'">
          <FloatLabel variant="on" class="block">
            <InputNumber
              inputId="t_playoffQualifiersPerGroup"
              v-model="form.playoffQualifiersPerGroup"
              class="w-full"
              :min="1"
              :max="8"
            />
            <label for="t_playoffQualifiersPerGroup" class="flex items-center gap-2">
              Команд выходит из группы
              <span
                class="text-muted-color cursor-help select-none"
                title="Для корректной сетки плей-офф должно получиться groups * K = 2^n (4, 8, 16, 32...)."
              >
                ?
              </span>
            </label>
          </FloatLabel>
        </div>

        <div>
          <FloatLabel variant="on" class="block">
            <InputNumber inputId="t_intervalDays" v-model="form.intervalDays" class="w-full" :min="1" />
            <label for="t_intervalDays">Интервал туров (дней)</label>
          </FloatLabel>
        </div>
        <div>
          <FloatLabel variant="on" class="block">
            <MultiSelect
              inputId="t_allowedDays"
              v-model="form.allowedDays"
              :options="dayOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              placeholder="Любые дни"
              :showToggleAll="false"
              :maxSelectedLabels="0"
              selectedItemsLabel="Выбрано: {0}"
            />
            <label for="t_allowedDays">Разрешённые дни</label>
          </FloatLabel>
        </div>

        <div>
          <FloatLabel variant="on" class="block">
            <InputNumber inputId="t_minTeams" v-model="form.minTeams" class="w-full" :min="2" />
            <label for="t_minTeams">Мин. команд</label>
          </FloatLabel>
        </div>
        <div>
          <FloatLabel variant="on" class="block">
            <MultiSelect
              inputId="t_adminIds"
              v-model="form.adminIds"
              :loading="adminsLoading"
              :options="users"
              option-label="email"
              option-value="id"
              class="w-full"
              placeholder="Выбрать пользователей"
              filter
              :maxSelectedLabels="0"
              selectedItemsLabel="Выбрано: {0}"
            />
            <label for="t_adminIds">Админы турнира</label>
          </FloatLabel>
        </div>

        <div class="md:col-span-2">
          <FloatLabel variant="on" class="block">
            <MultiSelect
              inputId="t_teamIds"
              v-model="form.teamIds"
              :loading="teamsLoading"
              :options="teams.length ? teams : fallbackTeams"
              option-label="name"
              option-value="id"
              class="w-full"
              placeholder="Выбрать команды"
              filter
              :maxSelectedLabels="0"
              selectedItemsLabel="Выбрано: {0}"
            />
            <label for="t_teamIds">Команды</label>
          </FloatLabel>
        </div>

        <div class="md:col-span-2">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsWin"
                v-model="form.pointsWin"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsWin">Очки за победу</label>
            </FloatLabel>

            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsDraw"
                v-model="form.pointsDraw"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsDraw">Очки за ничью</label>
            </FloatLabel>

            <FloatLabel variant="on" class="w-full flex flex-col">
              <InputNumber
                inputId="t_pointsLoss"
                v-model="form.pointsLoss"
                class="w-full !flex"
                :min="0"
                inputClass="w-full"
              />
              <label for="t_pointsLoss">Очки за поражение</label>
            </FloatLabel>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button
            :label="isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            :loading="saving"
            @click="saveTournament"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>


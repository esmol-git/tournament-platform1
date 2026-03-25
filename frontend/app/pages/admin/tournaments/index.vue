<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type {
  TournamentDetails,
  TournamentFormat,
  TournamentListResponse,
  TournamentRow,
  TournamentStatus,
  UserLite,
} from '~/types/admin/tournaments-index'
import type { TeamLite } from '~/types/tournament-admin'
import { getApiErrorMessage, getApiErrorMessages } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS, sleepRemainingAfter } from '~/utils/minimumLoadingDelay'
import { tournamentFormatLabel } from '~/utils/tournamentAdminUi'
import { slugifyFromTitle } from '~/utils/slugify'
import SelectButton from 'primevue/selectbutton'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ layout: 'admin' })

const router = useRouter()
const toast = useToast()
const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()

const tenantId = useTenantId()

/** true до первого завершённого запроса списка — иначе при F5 один кадр «Пока нет турниров». */
const loading = ref(true)
const tournaments = ref<TournamentRow[]>([])
const tournamentsTotal = ref(0)
const tournamentsPage = ref(0)
const tournamentsPageSize = 5
/** Число карточек в скелетоне = `tournamentsPageSize` (первая страница списка). */
const skeletonTournamentRows = Array.from({ length: tournamentsPageSize }, (_, i) => ({
  id: `__tsk-${i}`,
}))
const loadingMoreTournaments = ref(false)
const tournamentsSearch = ref('')
const loadMoreAnchor = ref<HTMLElement | null>(null)
const hasUserInteractedForInfinite = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
let tournamentsObserver: IntersectionObserver | null = null
let detachScrollUnlock: (() => void) | null = null

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const isEdit = computed(() => !!editingId.value)
const initialTeamIds = ref<string[]>([])
const manualPlayoffEnabled = ref(false)

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
const categoriesLoading = ref(false)
const teamCategoryOptions = ref<Array<{ label: string; value: string }>>([])

const formatOptions = [
  { value: 'SINGLE_GROUP', label: 'Единая группа (круговой турнир)' },
  { value: 'PLAYOFF', label: 'Сразу плей-офф (олимпийка)' },
  { value: 'GROUPS_PLUS_PLAYOFF', label: 'Группы + плей-офф' },
  { value: 'MANUAL', label: 'Только ручное расписание (без автогенерации)' },
] as const satisfies { value: TournamentFormat; label: string }[]

const statusOptions = [
  { value: 'DRAFT' as const, label: 'Черновик' },
  { value: 'ACTIVE' as const, label: 'Активный' },
  { value: 'COMPLETED' as const, label: 'Завершен' },
  { value: 'ARCHIVED' as const, label: 'Архивный' },
]

const statusTabOptions = [
  { value: 'all' as const, label: 'Все' },
  ...statusOptions,
]

const statusFilter = ref<'all' | TournamentStatus>('all')

const hasMoreTournaments = computed(
  () => tournaments.value.length < tournamentsTotal.value,
)

function statusLabel(s: TournamentStatus): string {
  return statusOptions.find((o) => o.value === s)?.label ?? s
}

function statusBadgeClass(s: TournamentStatus): string {
  switch (s) {
    case 'DRAFT':
      return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
    case 'ACTIVE':
      return 'border-primary/35 bg-primary/12 text-primary'
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'ARCHIVED':
      return 'border-surface-300 bg-surface-100 text-surface-600 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300'
    default:
      return 'border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900'
  }
}

const adminsLoading = ref(false)
const users = ref<UserLite[]>([])

const form = reactive({
  name: '',
  description: '',
  category: '',
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
const tournamentCategorySelectOptions = computed(() => {
  const value = form.category?.trim() || ''
  if (!value) return teamCategoryOptions.value
  if (teamCategoryOptions.value.some((o) => o.value === value)) return teamCategoryOptions.value
  return [{ label: value, value }, ...teamCategoryOptions.value]
})

const impliedGroupCount = computed<number | null>(() => {
  switch (form.format) {
    case 'SINGLE_GROUP':
      return 1
    case 'PLAYOFF':
      return 0
    case 'MANUAL':
      return null
    default:
      return null // GROUPS_PLUS_PLAYOFF: кол-во групп задаётся полем ниже (1–8)
  }
})

const groupCountMin = computed(() => (impliedGroupCount.value === null ? 1 : impliedGroupCount.value))
const groupCountMax = computed(() => (impliedGroupCount.value === null ? 8 : impliedGroupCount.value))
const minTeamsMinValue = computed(() => (form.format === 'PLAYOFF' ? 4 : 2))
const isPlayoffFormat = computed(() => form.format === 'PLAYOFF')
const isGroupsPlusPlayoffFormat = computed(() => form.format === 'GROUPS_PLUS_PLAYOFF')
const showGroupCountField = computed(() => impliedGroupCount.value === null)
const showPlayoffQualifiersField = computed(() => {
  if (form.format === 'PLAYOFF' || form.format === 'SINGLE_GROUP') return false
  if (form.format === 'MANUAL') return manualPlayoffEnabled.value
  return true
})
const minTeamsGridClass = computed(() => {
  if (showGroupCountField.value && !showPlayoffQualifiersField.value) {
    return 'md:col-start-2 md:row-start-2'
  }
  if (form.format === 'MANUAL') {
    return manualPlayoffEnabled.value
      ? 'md:col-start-2 md:row-start-2'
      : 'md:col-span-2 md:row-start-3'
  }
  if (form.format === 'SINGLE_GROUP' || form.format === 'PLAYOFF') {
    return 'md:col-start-2 md:row-start-1'
  }
  if (form.format === 'GROUPS_PLUS_PLAYOFF') {
    return 'md:col-start-1 md:row-start-2'
  }
  return 'md:col-start-1'
})
const playoffTeamCountOptions = [4, 8, 16, 32, 64, 128, 256]

function isPowerOfTwo(n: number) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

watch(
  () => form.format,
  (next, prev) => {
    const implied = impliedGroupCount.value
    if (implied !== null) {
      form.groupCount = implied
    }
    if (next === 'PLAYOFF' && prev !== 'PLAYOFF') {
      form.minTeams = 4
      return
    }
    if (next === 'PLAYOFF' && form.minTeams < 4) {
      form.minTeams = 4
    }
  },
  { immediate: true },
)

/** Не даём «0» и выход за min/max (бэкенд/API могли отдать 0). */
watch(
  [groupCountMin, groupCountMax],
  () => {
    const min = groupCountMin.value
    const max = groupCountMax.value
    let n = form.groupCount
    if (typeof n !== 'number' || Number.isNaN(n)) {
      form.groupCount = min
      return
    }
    if (n < min) form.groupCount = min
    else if (n > max) form.groupCount = max
  },
  { immediate: true },
)

watch(
  () => form.teamIds.slice(),
  (ids) => {
    if (ids.length <= form.minTeams) return
    form.teamIds = ids.slice(0, form.minTeams)
    toast.add({
      severity: 'warn',
      summary: 'Лимит команд',
      detail: `Можно выбрать не больше ${form.minTeams} команд.`,
      life: 3500,
    })
  },
)

watch(
  () => form.category,
  async () => {
    await fetchTeamsLite()
    const allowedIds = new Set((teams.value ?? []).map((t) => t.id))
    const filtered = form.teamIds.filter((id) => allowedIds.has(id))
    if (filtered.length !== form.teamIds.length) {
      form.teamIds = filtered
      toast.add({
        severity: 'warn',
        summary: 'Состав обновлен',
        detail: 'Команды другой категории убраны из турнира.',
        life: 3500,
      })
    }
  },
)

const groupCountHintText = computed(() => {
  const implied = impliedGroupCount.value
  if (implied === null) {
    return 'Укажите число групп (1–8). Для «Группы + плей-офф» обычно 2 и больше. Календарь потребует достаточно команд по группам.'
  }
  if (implied === 0) {
    return 'Для «Сразу плей-офф» группы не используются — это олимпийская сетка.'
  }
  return `Для выбранного формата число групп задано автоматически: ${implied}.`
})

const playoffQualifiersHintText =
  'Сколько сильнейших команд из каждой группы выходят в плей-офф. Удобно, чтобы (число групп × это значение) было 4, 8, 16… — тогда сетка без «пустых» ячеек.'

const formatFieldHintText =
  'Тип турнира: круговая одна группа, группы с выходом в плей-офф, только плей-офф или полностью ручное расписание.'

const minTeamsHintText = computed(() =>
  form.format === 'PLAYOFF'
    ? 'Для олимпийки это точное количество участников сетки. Доступные значения: 4, 8, 16, 32, 64, 128, 256.'
    : form.format === 'GROUPS_PLUS_PLAYOFF'
      ? 'Для формата «Группы + плей-офф» выбирается количество команд, кратное числу групп (минимум по 2 команды на группу).'
    : 'Фиксированное количество команд в турнире. Выбрать можно ровно это число.',
)

const playoffPreview = computed(() => {
  if (form.format !== 'GROUPS_PLUS_PLAYOFF' && form.format !== 'MANUAL') return null
  if (form.format === 'MANUAL' && !manualPlayoffEnabled.value) return null
  const groups = Number(form.groupCount)
  const qualifiersPerGroup = Number(form.playoffQualifiersPerGroup)
  const totalQualifiers = groups * qualifiersPerGroup
  const valid =
    Number.isInteger(groups) &&
    groups >= 1 &&
    Number.isInteger(qualifiersPerGroup) &&
    qualifiersPerGroup >= 1 &&
    qualifiersPerGroup <= 8 &&
    isPowerOfTwo(totalQualifiers)

  return {
    groups,
    qualifiersPerGroup,
    totalQualifiers,
    valid,
  }
})

const groupedTeamsPreview = computed(() => {
  if (form.format !== 'GROUPS_PLUS_PLAYOFF') return null
  const groups = Number(form.groupCount)
  const minTeams = Number(form.minTeams)
  if (!Number.isInteger(groups) || groups < 1) return null
  if (!Number.isInteger(minTeams) || minTeams < 2) return null

  const divisible = minTeams % groups === 0
  const perGroup = divisible ? minTeams / groups : null
  const enoughForGroups = minTeams >= groups * 2
  const valid = divisible && enoughForGroups

  return {
    groups,
    minTeams,
    divisible,
    enoughForGroups,
    perGroup,
    valid,
  }
})

const groupedAndPlayoffHint = computed(() => {
  if (form.format !== 'GROUPS_PLUS_PLAYOFF') return null
  const group = groupedTeamsPreview.value
  const playoff = playoffPreview.value
  if (!group && !playoff) return null

  if (group && playoff) {
    return {
      valid: group.valid && playoff.valid,
      text: `Группы: ${group.groups} × ${group.perGroup ?? '—'} команд; плей-офф: ${playoff.totalQualifiers} (${playoff.groups} × ${playoff.qualifiersPerGroup}).`,
    }
  }

  if (group) {
    return {
      valid: group.valid,
      text: group.valid
        ? `Группы: ${group.groups} × ${group.perGroup ?? '—'} команд.`
        : `Для ${group.groups} групп нужно кратное число команд (сейчас ${group.minTeams}) и минимум ${group.groups * 2}.`,
    }
  }

  return {
    valid: playoff?.valid ?? false,
    text: playoff?.valid
      ? `Плей-офф: ${playoff?.totalQualifiers} (${playoff?.groups} × ${playoff?.qualifiersPerGroup}) — валидная сетка.`
      : `Плей-офф: ${playoff?.totalQualifiers} — невалидно, нужно 4/8/16/32/64/128/256.`,
  }
})

const manualGroupsHint = computed(() => {
  if (form.format !== 'MANUAL' || manualPlayoffEnabled.value) return ''
  return 'Ручной формат допускает разное количество команд в группах. Ограничения по плей-офф применяются только если включить «Будет плей-офф».'
})

const formatCalendarHint = computed<{ valid: boolean; text: string } | null>(() => {
  if (form.format === 'GROUPS_PLUS_PLAYOFF') {
    if (!groupedAndPlayoffHint.value) return null
    return groupedAndPlayoffHint.value
  }

  if (form.format === 'MANUAL') {
    if (!manualPlayoffEnabled.value) {
      return { valid: true, text: manualGroupsHint.value }
    }
    if (!playoffPreview.value) return null
    return {
      valid: playoffPreview.value.valid,
      text: playoffPreview.value.valid
        ? `Итого в плей-офф: ${playoffPreview.value.totalQualifiers} (${playoffPreview.value.groups} × ${playoffPreview.value.qualifiersPerGroup}) — валидная сетка.`
        : `Итого в плей-офф: ${playoffPreview.value.totalQualifiers} — невалидно, нужно 4/8/16/32/64/128/256.`,
    }
  }

  if (form.format === 'PLAYOFF') {
    const valid = playoffTeamCountOptions.includes(form.minTeams)
    return {
      valid,
      text: valid
        ? `Сетка плей-офф: ${form.minTeams} команд. Допустимые значения: 4, 8, 16, 32, 64, 128, 256.`
        : 'Для олимпийки выберите 4, 8, 16, 32, 64, 128 или 256 команд.',
    }
  }

  if (form.format === 'SINGLE_GROUP') {
    return {
      valid: true,
      text: 'Единая группа: календарь строится круговым турниром без плей-офф.',
    }
  }

  return null
})

type NumericFieldKey = 'groupCount' | 'playoffQualifiersPerGroup' | 'minTeams'
function syncNumericField(key: NumericFieldKey, value: unknown) {
  const n = Number(value)
  if (Number.isFinite(n)) form[key] = n
}

const fetchTournaments = async (opts: { reset?: boolean } = {}) => {
  if (!token.value) {
    loading.value = false
    loadingMoreTournaments.value = false
    return
  }
  const reset = opts.reset !== false
  const nextPage = reset ? 1 : tournamentsPage.value + 1
  const loadStartedAt = Date.now()
  if (reset) loading.value = true
  else loadingMoreTournaments.value = true
  try {
    const res = await authFetch<TournamentListResponse>(
      apiUrl(`/tenants/${tenantId.value}/tournaments`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
        params: {
          page: nextPage,
          pageSize: tournamentsPageSize,
          ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
          ...(tournamentsSearch.value.trim()
            ? { q: tournamentsSearch.value.trim() }
            : {}),
        },
      },
    )
    const items = res.items ?? []
    tournamentsTotal.value = res.total ?? 0
    tournamentsPage.value = res.page ?? nextPage
    if (reset) {
      tournaments.value = items
      return
    }
    const seen = new Set(tournaments.value.map((t) => t.id))
    for (const t of items) {
      if (!seen.has(t.id)) {
        seen.add(t.id)
        tournaments.value.push(t)
      }
    }
  } finally {
    if (reset) {
      await sleepRemainingAfter(MIN_SKELETON_DISPLAY_MS, loadStartedAt)
      loading.value = false
    } else {
      loadingMoreTournaments.value = false
    }
  }
}

const onTournamentsSearchInput = (v: string) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchDebounce = null
    tournamentsSearch.value = v
    void fetchTournaments({ reset: true })
  }, 250)
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

const fetchTeamsLite = async () => {
  if (!token.value) return
  teamsLoading.value = true
  try {
    const res = await authFetch<{ items: TeamLite[]; total: number }>(
      apiUrl(`/tenants/${tenantId.value}/teams`),
      {
      headers: { Authorization: `Bearer ${token.value}` },
      params: {
        ...(form.category ? { category: form.category } : {}),
      },
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
  form.category = ''
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
  manualPlayoffEnabled.value = false
  showForm.value = true
  if (!users.value.length) await fetchUsersLite()
  if (!teamCategoryOptions.value.length) await fetchTeamCategories()
  await fetchTeamsLite()
}

function normalizeLegacyGroupsFormat(
  format: TournamentFormat,
  groupCount: number,
): { format: TournamentFormat; groupCount: number } {
  switch (format) {
    case 'GROUPS_2':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 2) }
    case 'GROUPS_3':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 3) }
    case 'GROUPS_4':
      return { format: 'GROUPS_PLUS_PLAYOFF', groupCount: Math.max(groupCount, 4) }
    default:
      return { format, groupCount }
  }
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
    form.category = (res as any).category ?? ''
    form.logoUrl = res.logoUrl ?? ''
    const normalized = normalizeLegacyGroupsFormat(res.format, (res.groupCount ?? 1) as number)
    form.format = normalized.format
    form.groupCount = normalized.groupCount
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
    manualPlayoffEnabled.value =
      normalized.format === 'MANUAL'
        ? Array.isArray((res as any).matches) &&
          (res as any).matches.some((m: any) => m?.stage === 'PLAYOFF')
        : false

    showForm.value = true
    if (!users.value.length) await fetchUsersLite()
    if (!teamCategoryOptions.value.length) await fetchTeamCategories()
    await fetchTeamsLite()
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
  if (!form.name.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Название не заполнено',
      detail: 'Укажите название турнира.',
      life: 3500,
    })
    return
  }
  if (!form.teamIds.length) {
    toast.add({
      severity: 'warn',
      summary: 'Не выбраны команды',
      detail: 'Добавьте хотя бы одну команду для создания турнира.',
      life: 4000,
    })
    return
  }
  if (form.teamIds.length !== form.minTeams) {
    toast.add({
      severity: 'warn',
      summary: 'Проверь количество команд',
      detail: `Нужно выбрать ровно ${form.minTeams} команд. Сейчас выбрано: ${form.teamIds.length}.`,
      life: 5000,
    })
    return
  }
  if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) {
    toast.add({
      severity: 'warn',
      summary: 'Проверь даты',
      detail: 'Дата начала не может быть позже даты окончания.',
      life: 4000,
    })
    return
  }
  if (form.format === 'PLAYOFF' && (form.minTeams < 4 || !isPowerOfTwo(form.minTeams))) {
    toast.add({
      severity: 'warn',
      summary: 'Некорректное количество команд',
      detail: 'Для олимпийки укажите 4, 8, 16, 32, 64, 128 и т.д.',
      life: 4500,
    })
    return
  }
  if (form.format === 'PLAYOFF' && !playoffTeamCountOptions.includes(form.minTeams)) {
    toast.add({
      severity: 'warn',
      summary: 'Некорректное количество команд',
      detail: 'Для олимпийки доступны только: 4, 8, 16, 32, 64, 128, 256.',
      life: 4500,
    })
    return
  }
  if (
    form.format === 'GROUPS_PLUS_PLAYOFF' &&
    (!Number.isInteger(form.groupCount) ||
      form.groupCount < 1 ||
      form.minTeams < form.groupCount * 2 ||
      form.minTeams % form.groupCount !== 0)
  ) {
    toast.add({
      severity: 'warn',
      summary: 'Некорректное количество команд',
      detail: `Для ${form.groupCount} групп количество команд должно быть кратно числу групп и не меньше ${form.groupCount * 2}.`,
      life: 5000,
    })
    return
  }
  saving.value = true
  try {
    const playoffQualifiersForBody =
      form.format === 'MANUAL' && !manualPlayoffEnabled.value
        ? undefined
        : form.playoffQualifiersPerGroup

    const body = {
      name: form.name,
      slug: tournamentSlugGenerated.value,
      description: form.description || undefined,
      category: form.category || undefined,
      logoUrl: form.logoUrl || undefined,
      format: form.format,
      groupCount: form.format === 'PLAYOFF' ? 0 : form.groupCount,
      playoffQualifiersPerGroup: playoffQualifiersForBody,
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
  } catch (e: unknown) {
    const messages = getApiErrorMessages(e, 'Не удалось создать турнир')
    for (const msg of messages) {
      toast.add({
        severity: 'error',
        summary: 'Ошибка создания турнира',
        detail: msg,
        life: 6500,
      })
    }
  } finally {
    saving.value = false
  }
}

const deleteDialogVisible = ref(false)
const deleteTarget = ref<TournamentRow | null>(null)
const deleteSaving = ref(false)

const openDeleteDialog = (t: TournamentRow) => {
  deleteTarget.value = t
  deleteDialogVisible.value = true
}

const confirmDeleteTournament = async () => {
  if (!token.value || !deleteTarget.value) return
  const t = deleteTarget.value
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${t.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchTournaments()
    toast.add({ severity: 'success', summary: 'Турнир удалён', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить турнир',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const moveTournamentToArchive = async () => {
  if (!token.value || !deleteTarget.value) return
  const t = deleteTarget.value
  if (t.status === 'ARCHIVED') {
    toast.add({ severity: 'info', summary: 'Турнир уже в архиве', life: 2500 })
    return
  }
  deleteSaving.value = true
  try {
    await authFetch(apiUrl(`/tournaments/${t.id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { status: 'ARCHIVED' },
    })
    deleteDialogVisible.value = false
    deleteTarget.value = null
    await fetchTournaments()
    toast.add({ severity: 'success', summary: 'Турнир отправлен в архив', life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось отправить турнир в архив',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    deleteSaving.value = false
  }
}

const goToTournament = (t: TournamentRow) => {
  router.push(`/admin/tournaments/${t.id}`)
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      loading.value = false
      router.push('/admin/login')
      return
    }
  }
  void fetchTournaments({ reset: true })
  void fetchTeamCategories()

  if (typeof window !== 'undefined') {
    const unlockAndMaybeLoad = () => {
      hasUserInteractedForInfinite.value = true
      if (
        !loading.value &&
        !loadingMoreTournaments.value &&
        hasMoreTournaments.value &&
        loadMoreAnchor.value
      ) {
        const rect = loadMoreAnchor.value.getBoundingClientRect()
        if (rect.top <= window.innerHeight + 200) {
          void fetchTournaments({ reset: false })
        }
      }
    }
    const unlockOnKeydown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'PageDown' ||
        e.key === 'End' ||
        e.key === ' '
      ) {
        unlockAndMaybeLoad()
      }
    }
    window.addEventListener('wheel', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('touchmove', unlockAndMaybeLoad, { passive: true })
    window.addEventListener('keydown', unlockOnKeydown)
    detachScrollUnlock = () => {
      window.removeEventListener('wheel', unlockAndMaybeLoad)
      window.removeEventListener('touchmove', unlockAndMaybeLoad)
      window.removeEventListener('keydown', unlockOnKeydown)
    }

    tournamentsObserver?.disconnect()
    tournamentsObserver = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (!hasUserInteractedForInfinite.value) return
        if (loading.value || loadingMoreTournaments.value || !hasMoreTournaments.value) return
        void fetchTournaments({ reset: false })
      },
      { root: null, rootMargin: '120px 0px 200px 0px', threshold: 0 },
    )
    if (loadMoreAnchor.value) tournamentsObserver.observe(loadMoreAnchor.value)
  }
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
  tournamentsObserver?.disconnect()
  tournamentsObserver = null
  detachScrollUnlock?.()
  detachScrollUnlock = null
})

watch(loadMoreAnchor, (el) => {
  if (!tournamentsObserver) return
  tournamentsObserver.disconnect()
  if (el) tournamentsObserver.observe(el)
})

watch(statusFilter, () => {
  void fetchTournaments({ reset: true })
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Турниры</h1>
        <p class="mt-1 text-sm text-muted-color">
          Создание турнира, настройка календаря и управление командами.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchTournaments({ reset: true })"
        />
        <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
      </div>
    </header>

    <div v-if="loading" class="space-y-3 min-h-[28rem]" aria-busy="true">
      <div
        v-for="row in skeletonTournamentRows"
        :key="row.id"
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-5 min-w-0 flex-1">
            <Skeleton width="10rem" height="10rem" class="rounded-xl shrink-0" />
            <div class="min-w-0 flex-1 space-y-3">
              <Skeleton width="65%" height="1.125rem" class="rounded-md" />
              <Skeleton width="8rem" height="0.75rem" class="rounded-md" />
              <Skeleton width="85%" height="0.875rem" class="rounded-md" />
              <Skeleton width="75%" height="0.875rem" class="rounded-md" />
              <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            </div>
          </div>
          <div class="flex flex-col gap-2 shrink-0 items-end">
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
            <Skeleton shape="circle" width="2rem" height="2rem" />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="space-y-3">
      <div
        v-if="tournamentsTotal || tournamentsSearch || statusFilter !== 'all'"
        class="flex flex-col gap-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 px-4 py-3"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span class="text-sm font-medium text-surface-700 dark:text-surface-200">Статус</span>
          <SelectButton
            v-model="statusFilter"
            :options="statusTabOptions"
            option-label="label"
            option-value="value"
            class="tournament-status-filter w-full sm:w-auto [&_.p-button]:flex-1 sm:[&_.p-button]:flex-initial"
          />
        </div>
        <InputText
          :model-value="tournamentsSearch"
          class="w-full"
          placeholder="Поиск турнира по названию"
          @update:model-value="onTournamentsSearchInput"
        />
        <div class="text-xs text-muted-color">
          Загружено {{ tournaments.length }} из {{ tournamentsTotal }}
        </div>
      </div>

      <div
        v-for="t in tournaments"
        :key="t.id"
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-5">
            <div
              class="w-40 h-40 shrink-0 rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-100 dark:bg-surface-800 overflow-hidden"
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
                <div class="font-medium text-surface-900 dark:text-surface-100">{{ tournamentFormatLabel(t.format) }}</div>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-20 shrink-0 text-xs text-muted-color">Статус</div>
                <span
                  class="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide"
                  :class="statusBadgeClass(t.status)"
                >
                  {{ statusLabel(t.status) }}
                </span>
              </div>
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Команд</div>
                <div class="font-medium text-surface-900 dark:text-surface-100">{{ t.teamsCount }}</div>
              </div>
              <div class="flex items-baseline gap-2">
                <div class="w-20 text-xs text-muted-color">Даты</div>
                <div class="font-medium text-surface-900 dark:text-surface-100">
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
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="openDeleteDialog(t)" aria-label="Удалить" />
          </div>
        </div>
      </div>

      <div
        v-if="!loading && tournamentsTotal > 0 && !tournaments.length"
        class="rounded-lg border border-dashed border-surface-300 dark:border-surface-600 px-4 py-8 text-center text-sm text-muted-color"
      >
        По заданным параметрам турниры не найдены.
      </div>

      <div v-if="!loading && !tournamentsTotal" class="text-sm text-muted-color">Пока нет турниров.</div>
      <div v-if="loadingMoreTournaments" class="text-sm text-muted-color">Подгружаем турниры…</div>
      <div
        v-if="hasMoreTournaments"
        ref="loadMoreAnchor"
        class="h-6 w-full"
        aria-hidden="true"
      />
    </div>

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать турнир' : 'Создать турнир'"
      :style="{ width: '46rem', maxWidth: 'min(46rem, calc(100vw - 2rem))' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="flex flex-col gap-4">
        <!-- Основное -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">Основное</h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- Left: превью логотипа -->
        <div class="md:col-span-1 h-full relative">
          <button
            type="button"
            class="w-full h-full min-h-[10rem] overflow-hidden rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-0 dark:bg-surface-900 flex items-center justify-center relative leading-none"
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
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-0/90 dark:bg-surface-900/90 text-sm text-surface-700 dark:text-surface-200"
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
            class="!absolute top-2 right-2 z-10 !h-9 !w-9 !min-w-9 shadow-sm bg-surface-0/90 dark:bg-surface-900/90 hover:!bg-surface-0 dark:hover:!bg-surface-900"
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

          <FloatLabel variant="on" class="block">
            <InputText
              id="t_slug"
              :model-value="tournamentSlugGenerated"
              readonly
              tabindex="-1"
              class="w-full cursor-default bg-surface-50 font-mono text-sm dark:bg-surface-900"
            />
            <label for="t_slug">Slug в URL (формируется автоматически)</label>
          </FloatLabel>

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

          <div class="space-y-2">
            <label for="t_status" class="block text-xs font-medium text-muted-color">Статус</label>
            <Select
              inputId="t_status"
              v-model="form.status"
              :options="statusOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </div>
        </div>
          </div>
        </section>

        <!-- Описание -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">Описание</h3>
          <FloatLabel variant="on" class="block">
            <Textarea id="t_desc" v-model="form.description" class="w-full" rows="3" />
            <label for="t_desc">Текст для участников</label>
          </FloatLabel>
        </section>

        <!-- Формат и календарь -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Формат и календарь
          </h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FloatLabel variant="on" class="block">
              <Select
                inputId="t_format"
                v-model="form.format"
                :options="formatOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
              <label for="t_format" class="has-tooltip flex items-center gap-1.5">
                <span>Формат</span>
                <button
                  type="button"
                  class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  aria-label="Подсказка: формат турнира"
                  v-tooltip.top="formatFieldHintText"
                  @click.prevent
                >
                  <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                </button>
              </label>
            </FloatLabel>

            <FloatLabel variant="on" class="block">
              <Select
                inputId="t_category"
                v-model="form.category"
                :options="tournamentCategorySelectOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                :loading="categoriesLoading"
                showClear
              />
              <label for="t_category" class="has-tooltip flex items-center gap-1.5">
                <span>Категория турнира</span>
                <button
                  type="button"
                  class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  aria-label="Подсказка: категория турнира"
                  v-tooltip.top="'Если категория выбрана, в турнир можно добавить только команды этой категории.'"
                  @click.prevent
                >
                  <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                </button>
              </label>
            </FloatLabel>

            <div
              v-if="form.format === 'MANUAL'"
              class="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800/60 md:col-start-2 md:row-start-1"
            >
              <label for="manual_playoff_enabled" class="inline-flex items-center gap-2 cursor-pointer">
                <Checkbox
                  inputId="manual_playoff_enabled"
                  v-model="manualPlayoffEnabled"
                  binary
                />
                <span>Будет плей-офф</span>
              </label>
            </div>

            <div
              v-if="showGroupCountField"
              :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-2' : ''"
            >
              <FloatLabel variant="on" class="block">
                <InputNumber
                  inputId="t_groupCount"
                  v-model="form.groupCount"
                  class="w-full"
                  :min="groupCountMin"
                  :max="groupCountMax"
                  :readonly="impliedGroupCount !== null"
                  @input="(e) => syncNumericField('groupCount', e?.value)"
                />
                <label for="t_groupCount" class="has-tooltip flex items-center gap-1.5">
                  <span>Кол-во групп</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество групп"
                    v-tooltip.top="groupCountHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div :class="minTeamsGridClass">
              <FloatLabel v-if="isPlayoffFormat" variant="on" class="block">
                <Select
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  :options="playoffTeamCountOptions"
                  class="w-full"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>

              <FloatLabel v-else-if="isGroupsPlusPlayoffFormat" variant="on" class="block">
                <InputNumber
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="2"
                  @input="(e) => syncNumericField('minTeams', e?.value)"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: количество команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>

              <FloatLabel v-else variant="on" class="block">
                <InputNumber
                  inputId="t_minTeams"
                  v-model="form.minTeams"
                  class="w-full"
                  :min="minTeamsMinValue"
                  @input="(e) => syncNumericField('minTeams', e?.value)"
                />
                <label for="t_minTeams" class="has-tooltip flex items-center gap-1.5">
                  <span>Количество команд</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: минимум команд"
                    v-tooltip.top="minTeamsHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div
              v-if="showPlayoffQualifiersField"
              :class="form.format === 'MANUAL' ? 'md:col-start-1 md:row-start-3' : 'md:col-start-2 md:row-start-2'"
            >
              <FloatLabel variant="on" class="block">
                <InputNumber
                  inputId="t_playoffQualifiersPerGroup"
                  v-model="form.playoffQualifiersPerGroup"
                  class="w-full"
                  :min="1"
                  :max="8"
                  @input="(e) => syncNumericField('playoffQualifiersPerGroup', e?.value)"
                />
                <label for="t_playoffQualifiersPerGroup" class="has-tooltip flex items-center gap-1.5">
                  <span>Команд выходит из группы</span>
                  <button
                    type="button"
                    class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    aria-label="Подсказка: выход в плей-офф"
                    v-tooltip.top="playoffQualifiersHintText"
                    @click.prevent
                  >
                    <i class="pi pi-info-circle text-sm" aria-hidden="true" />
                  </button>
                </label>
              </FloatLabel>
            </div>

            <div
              v-if="formatCalendarHint"
              class="rounded-lg border px-3 py-2 text-xs md:col-span-2"
              :class="
                formatCalendarHint.valid
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              "
            >
              {{ formatCalendarHint.text }}
            </div>
          </div>
        </section>

        <!-- Участники и доступ -->
        <section
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Участники и доступ
          </h3>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <FloatLabel variant="on" class="block md:col-span-2">
              <MultiSelect
                inputId="t_teamIds"
                v-model="form.teamIds"
                :loading="teamsLoading"
                :options="teams"
                option-label="name"
                option-value="id"
                class="w-full"
                placeholder="Выбрать команды"
                :emptyMessage="form.category ? 'Нет команд в выбранной категории' : 'Нет доступных команд'"
                filter
                :maxSelectedLabels="0"
                selectedItemsLabel="Выбрано: {0}"
              />
              <label for="t_teamIds">Команды</label>
            </FloatLabel>
          </div>
        </section>

        <!-- Очки -->
        <section
          v-if="!isPlayoffFormat"
          class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
        >
          <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
            Турнирная таблица (очки)
          </h3>
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
        </section>
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

    <Dialog
      v-model:visible="deleteDialogVisible"
      modal
      header="Удалить турнир?"
      :style="{ width: '24rem' }"
      :closable="!deleteSaving"
      @hide="deleteTarget = null"
    >
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        Турнир
        <span class="font-semibold text-surface-900 dark:text-surface-0">«{{ deleteTarget.name }}»</span>
        и все связанные данные будут безвозвратно утеряны.
      </p>
      <p class="mt-2 text-sm text-surface-600 dark:text-surface-300">
        Рекомендуем вместо удаления перенести турнир в архив.
      </p>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <Button label="Отмена" text :disabled="deleteSaving" @click="deleteDialogVisible = false" />
          <Button
            label="В архив"
            icon="pi pi-box"
            severity="secondary"
            :disabled="deleteSaving || deleteTarget?.status === 'ARCHIVED'"
            :loading="deleteSaving"
            @click="moveTournamentToArchive"
          />
          <Button
            label="Удалить"
            icon="pi pi-trash"
            severity="danger"
            :loading="deleteSaving"
            @click="confirmDeleteTournament"
          />
        </div>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
:deep(.p-floatlabel label.has-tooltip) {
  pointer-events: auto;
}
</style>


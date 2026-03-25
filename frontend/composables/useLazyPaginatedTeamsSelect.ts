import { computed, nextTick, watch, type Ref, ref } from 'vue'
import type { PlayerTeam } from '~/types/admin/player'

export type AuthFetchFn = <T>(url: string, options?: any) => Promise<T>

/** Не дергать /teams заново при каждом открытии селекта, если список свежий. */
const TEAMS_SELECT_CACHE_TTL_MS = 120_000

export interface UseLazyPaginatedTeamsSelectOptions {
  /** Класс на обёртке Select (внутри ищется `.p-select-list-container`) */
  panelRootClass: string
  pageSize?: number
  tenantId: Ref<string>
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
}

/**
 * Ленивая пагинация команд в PrimeVue Select (фильтр + бесконечный скролл в панели).
 * Два независимых экземпляра — для формы и для фильтра таблицы.
 *
 * `:loading` на Select — встроенный индикатор PrimeVue (см. страницы игроков).
 * Повторный запрос при открытии панели не делаем, если данные ещё в TTL, тот же тенант,
 * список не после поиска в панели; сброс при смене роут/тенанта.
 */
export function useLazyPaginatedTeamsSelect(opts: UseLazyPaginatedTeamsSelectOptions) {
  const pageSize = opts.pageSize ?? 10
  const listContainerSelector = `${opts.panelRootClass} .p-select-list-container`

  const teamsLoading = ref(false)
  const teamsLoadingMore = ref(false)
  const teamsTotal = ref(0)
  const teamsPage = ref(0)
  const teamsLoaded = ref<PlayerTeam[]>([])
  const teamsNameFilter = ref('')
  const selectedTeamCache = ref<PlayerTeam | null>(null)

  const lastSuccessFetchAt = ref(0)
  const lastFetchTenantId = ref<string | null>(null)
  /** Последняя подгрузка была с непустым поиском в панели — кэш «полного» списка невалиден. */
  const loadedWithActiveFilter = ref(false)

  const teamsHasMore = computed(() => teamsLoaded.value.length < teamsTotal.value)

  let teamFilterDebounce: ReturnType<typeof setTimeout> | null = null
  let teamPanelScrollCleanup: (() => void) | null = null

  function invalidateTeamsCache() {
    teamsLoaded.value = []
    teamsTotal.value = 0
    teamsPage.value = 0
    lastSuccessFetchAt.value = 0
    lastFetchTenantId.value = null
    loadedWithActiveFilter.value = false
  }

  if (import.meta.client) {
    const route = useRoute()
    watch(
      () => route.fullPath,
      () => invalidateTeamsCache(),
    )
    watch(
      () => opts.tenantId.value,
      (id, prev) => {
        if (prev !== undefined && id !== prev) invalidateTeamsCache()
      },
    )
  }

  async function fillTeamPanelUntilScrollable(depth = 0): Promise<void> {
    if (depth > 25 || !teamsHasMore.value) return
    await nextTick()
    const container = document.querySelector(listContainerSelector) as HTMLElement | null
    if (!container) return
    if (container.scrollHeight <= container.clientHeight + 8) {
      await fetchTeamsPage({ reset: false })
      await fillTeamPanelUntilScrollable(depth + 1)
    }
  }

  const fetchTeamsPage = async (fetchOpts: { reset?: boolean } = {}) => {
    if (!opts.token.value) return
    const reset = fetchOpts.reset !== false
    const nameQ = teamsNameFilter.value.trim()

    if (reset) {
      teamsPage.value = 0
      teamsLoaded.value = []
    }

    const nextPage = reset ? 1 : teamsPage.value + 1
    const busy = reset ? teamsLoading : teamsLoadingMore
    if (busy.value) return
    busy.value = true
    try {
      const res = await opts.authFetch<{ items: PlayerTeam[]; total: number }>(
        opts.apiUrl(`/tenants/${opts.tenantId.value}/teams`),
        {
          headers: { Authorization: `Bearer ${opts.token.value}` },
          params: {
            page: nextPage,
            pageSize,
            ...(nameQ ? { name: nameQ } : {}),
            sortField: 'name',
            sortOrder: 1,
          },
        },
      )
      teamsTotal.value = res.total
      teamsPage.value = nextPage
      const items = res.items ?? []
      if (items.length === 0 && nextPage > 1) {
        teamsTotal.value = teamsLoaded.value.length
      }
      const seen = new Set(teamsLoaded.value.map((t) => t.id))
      for (const t of items) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          teamsLoaded.value.push(t)
        }
      }
      if (reset) {
        lastSuccessFetchAt.value = Date.now()
        lastFetchTenantId.value = opts.tenantId.value
        loadedWithActiveFilter.value = nameQ.length > 0
      }
      await fillTeamPanelUntilScrollable()
    } finally {
      busy.value = false
    }
  }

  const onTeamSelectFilter = (event: { value?: string }) => {
    const q = String(event?.value ?? '')
    if (teamFilterDebounce) clearTimeout(teamFilterDebounce)
    teamFilterDebounce = setTimeout(() => {
      teamFilterDebounce = null
      teamsNameFilter.value = q
      void fetchTeamsPage({ reset: true })
    }, 300)
  }

  function attachPanelScrollListener() {
    nextTick(() => {
      setTimeout(() => {
        teamPanelScrollCleanup?.()
        const container = document.querySelector(listContainerSelector) as HTMLElement | null
        if (!container) return
        const onScroll = () => {
          if (teamsLoadingMore.value || teamsLoading.value || !teamsHasMore.value) return
          if (
            container.scrollTop + container.clientHeight >=
            container.scrollHeight - 40
          ) {
            void fetchTeamsPage({ reset: false })
          }
        }
        container.addEventListener('scroll', onScroll, { passive: true })
        teamPanelScrollCleanup = () => {
          container.removeEventListener('scroll', onScroll)
          teamPanelScrollCleanup = null
        }
      }, 80)
    })
  }

  const onTeamSelectPanelShow = () => {
    const freshEnough =
      teamsLoaded.value.length > 0 &&
      !loadedWithActiveFilter.value &&
      opts.tenantId.value === lastFetchTenantId.value &&
      Date.now() - lastSuccessFetchAt.value < TEAMS_SELECT_CACHE_TTL_MS

    if (!freshEnough) {
      void fetchTeamsPage({ reset: true })
    }
    attachPanelScrollListener()
    if (freshEnough) {
      void fillTeamPanelUntilScrollable()
    }
  }

  const onTeamSelectPanelHide = () => {
    teamPanelScrollCleanup?.()
    teamsNameFilter.value = ''
    if (loadedWithActiveFilter.value) {
      invalidateTeamsCache()
    }
  }

  return {
    teamsLoading,
    teamsLoadingMore,
    teamsTotal,
    teamsPage,
    teamsLoaded,
    teamsNameFilter,
    selectedTeamCache,
    teamsHasMore,
    fetchTeamsPage,
    onTeamSelectFilter,
    onTeamSelectPanelShow,
    onTeamSelectPanelHide,
  }
}

/** Опции селекта: пустой пункт + загруженные команды + кэш выбранной, если её нет в текущей странице API */
export function useTeamSelectOptions(
  teamsLoaded: Ref<PlayerTeam[]>,
  selectedTeamCache: Ref<PlayerTeam | null>,
  getSelectedTeamId: () => string,
  emptyOption: { value: string; label: string },
) {
  return computed(() => {
    const base = [emptyOption]
    const fromLoaded = teamsLoaded.value.map((t) => ({ value: t.id, label: t.name }))
    const id = getSelectedTeamId()
    if (
      id &&
      !fromLoaded.some((o) => o.value === id) &&
      selectedTeamCache.value?.id === id
    ) {
      return [
        ...base,
        {
          value: selectedTeamCache.value.id,
          label: selectedTeamCache.value.name,
        },
        ...fromLoaded,
      ]
    }
    return [...base, ...fromLoaded]
  })
}

import type { TournamentListResponse, TournamentRow } from '~/types/admin/tournaments-index'
import type { TableRow, TournamentDetails } from '~/types/tournament-admin'
import { useApiUrl } from '~/composables/useApiUrl'

export type PublicRosterTeam = {
  teamId: string
  teamName: string
  logoUrl: string | null
  category: string | null
  description: string | null
  coachName: string | null
  groupId: string | null
  groupName: string | null
  players: Array<{
    id: string
    firstName: string
    lastName: string
    jerseyNumber: number | null
    position: string | null
    photoUrl: string | null
  }>
}

/**
 * Read-only запросы для страниц `/{tenant}/…` без JWT.
 * Бэкенд: `/public/tenants/:tenantSlug/...` (tenantSlug из URL).
 */
export function usePublicTournamentFetch() {
  const { apiUrl } = useApiUrl()

  function base(slug: string) {
    return apiUrl(`/public/tenants/${encodeURIComponent(slug)}`)
  }

  async function loadAllTournaments(tenantSlug: string): Promise<TournamentRow[]> {
    const loaded: TournamentRow[] = []
    let page = 1
    let total = 0
    do {
      const res = await $fetch<TournamentListResponse>(`${base(tenantSlug)}/tournaments`, {
        params: { page, pageSize: 100 },
      })
      const items = res.items ?? []
      total = res.total ?? items.length
      loaded.push(...items)
      page += 1
      if (!items.length) break
    } while (loaded.length < total)
    return loaded
  }

  async function fetchTournamentDetail(
    tenantSlug: string,
    tournamentId: string,
    query?: Record<string, string>,
  ) {
    return await $fetch<TournamentDetails>(`${base(tenantSlug)}/tournaments/${tournamentId}`, {
      query,
    })
  }

  async function fetchTable(tenantSlug: string, tournamentId: string, groupId?: string) {
    return await $fetch<TableRow[]>(`${base(tenantSlug)}/tournaments/${tournamentId}/table`, {
      params: groupId ? { groupId } : undefined,
    })
  }

  async function fetchRoster(tenantSlug: string, tournamentId: string) {
    return await $fetch<PublicRosterTeam[]>(
      `${base(tenantSlug)}/tournaments/${tournamentId}/roster`,
    )
  }

  async function fetchMediaFeed(tenantSlug: string) {
    return await $fetch<{ items: unknown[] }>(`${base(tenantSlug)}/media`)
  }

  return {
    base,
    loadAllTournaments,
    fetchTournamentDetail,
    fetchTable,
    fetchRoster,
    fetchMediaFeed,
  }
}

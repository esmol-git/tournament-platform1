/** Типы страницы списка/редактирования турниров (`/admin/tournaments`) */

export type TournamentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type TournamentFormat =
  | 'SINGLE_GROUP'
  | 'GROUPS_2'
  | 'GROUPS_3'
  | 'GROUPS_4'
  | 'PLAYOFF'
  | 'GROUPS_PLUS_PLAYOFF'

export interface TournamentRow {
  id: string
  name: string
  slug: string
  format: TournamentFormat
  startsAt: string | null
  endsAt: string | null
  status: TournamentStatus
  teamsCount: number
  logoUrl?: string | null
}

/** Ответ `GET /tournaments/:id` для формы редактирования со списка */
export interface TournamentDetails {
  id: string
  name: string
  slug: string
  description?: string | null
  logoUrl?: string | null
  format: TournamentFormat
  groupCount?: number
  playoffQualifiersPerGroup?: number
  status: TournamentStatus
  startsAt?: string | null
  endsAt?: string | null
  intervalDays: number
  allowedDays: number[]
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  members: { userId: string; role: string }[]
}

export interface UserLite {
  id: string
  email: string
  name: string
  role: string
  blocked: boolean
}

/** Турнир с матчами/группами для админ-страницы деталей */
export interface TournamentDetails {
  id: string
  name: string
  slug: string
  description?: string | null
  logoUrl?: string | null
  format: string
  groupCount?: number
  status: string
  startsAt?: string | null
  endsAt?: string | null
  intervalDays: number
  allowedDays: number[]
  matchDurationMinutes: number
  matchBreakMinutes: number
  simultaneousMatches: number
  dayStartTimeDefault: string
  dayStartTimeOverrides?: Record<string, string> | null
  playoffQualifiersPerGroup?: number
  minTeams: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  groups: { id: string; name: string; sortOrder: number }[]
  tournamentTeams: {
    teamId: string
    team: { id: string; name: string }
    group?: { id: string; name: string } | null
    rating?: number | null
    /** Порядок в колонке группы (для таблицы при равных очках). */
    groupSortOrder?: number | null
  }[]
  /** На публичном API не отдаётся. */
  members?: {
    id: string
    role: string
    user: { id: string; email: string; name: string; role: string }
  }[]
  matches: {
    id: string
    startTime: string
    stage?: 'GROUP' | 'PLAYOFF'
    roundNumber?: number
    groupId?: string | null
    playoffRound?: 'SEMIFINAL' | 'FINAL' | 'THIRD_PLACE' | null
    status: string
    homeTeam: { id: string; name: string }
    awayTeam: { id: string; name: string }
    homeScore?: number | null
    awayScore?: number | null
    events?: {
      id: string
      type: string
      minute?: number | null
      playerId?: string | null
      teamSide?: 'HOME' | 'AWAY' | null
      payload?: Record<string, unknown> | null
    }[]
  }[]
  matchNumberById?: Record<string, number>
}

export interface TableRow {
  teamId: string
  teamName: string
  position: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

export interface TeamLite {
  id: string
  name: string
  slug?: string | null
  category?: string | null
}

export type MatchRow = TournamentDetails['matches'][number]
export type MatchEventRow = NonNullable<MatchRow['events']>[number]

/** Матч из GET /tenants/:tenantId/matches (в турнире, с полем tournament) */
export type TenantTournamentMatchRow = MatchRow & {
  tournament: { id: string; name: string; slug: string; format: string }
}

export type CalendarRound = {
  round: number
  dateKey: string
  dateLabel: string
  title: string
  matches: MatchRow[]
}

export type CalendarViewMode = 'grouped' | 'tour'

export type TourSection = {
  key: string
  title: string
  dateLabel: string
  matches: MatchRow[]
}

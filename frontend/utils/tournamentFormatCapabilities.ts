export type TournamentFormatLike =
  | 'SINGLE_GROUP'
  | 'GROUPS_2'
  | 'GROUPS_3'
  | 'GROUPS_4'
  | 'PLAYOFF'
  | 'GROUPS_PLUS_PLAYOFF'
  | 'MANUAL'
  | string
  | null
  | undefined

export type TournamentCapabilities = {
  showTable: boolean
  showChessboard: boolean
  showProgress: boolean
  showPlayoff: boolean
}

export function getTournamentCapabilities(
  format: TournamentFormatLike,
): TournamentCapabilities {
  if (format === 'PLAYOFF') {
    return {
      showTable: false,
      showChessboard: false,
      showProgress: false,
      showPlayoff: true,
    }
  }

  return {
    showTable: true,
    showChessboard: true,
    showProgress: true,
    showPlayoff: true,
  }
}

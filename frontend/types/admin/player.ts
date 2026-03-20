export interface PlayerTeam {
  id: string
  name: string
  logoUrl: string | null
}

export interface PlayerRow {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  position: string | null
  phone: string | null
  bioNumber: string | null
  photoUrl: string | null
  biography: string | null
  team: PlayerTeam | null
}

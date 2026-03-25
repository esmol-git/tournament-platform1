export interface TeamCategoryRule {
  id: string
  type: 'AGE' | 'GENDER'
  minBirthYear: number | null
  maxBirthYear: number | null
  requireBirthDate: boolean
  allowedGenders: Array<'MALE' | 'FEMALE'>
}

export interface TeamCategoryRow {
  id: string
  name: string
  slug: string | null
  rules: TeamCategoryRule[]
}

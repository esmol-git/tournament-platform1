/**
 * Полных лет на указанную дату (по локальному календарю).
 */
export function ageInFullYears(
  birth: Date,
  reference: Date = new Date(),
): number | null {
  if (Number.isNaN(birth.getTime())) return null
  let age = reference.getFullYear() - birth.getFullYear()
  const m = reference.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && reference.getDate() < birth.getDate())) {
    age -= 1
  }
  return age < 0 ? null : age
}

/**
 * Склонение «N год / года / лет» для целого неотрицательного N.
 */
export function pluralizeYearsRu(n: number): string {
  const abs100 = n % 100
  const abs10 = n % 10
  if (abs100 >= 11 && abs100 <= 14) return `${n} лет`
  if (abs10 === 1) return `${n} год`
  if (abs10 >= 2 && abs10 <= 4) return `${n} года`
  return `${n} лет`
}

/** Для отображения в таблице: «12 лет» или «—» */
export function formatAgeFromIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const age = ageInFullYears(d)
  if (age === null) return '—'
  return pluralizeYearsRu(age)
}

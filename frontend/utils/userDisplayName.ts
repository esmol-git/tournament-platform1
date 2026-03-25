/**
 * Полное имя пользователя из сессии: API отдаёт `name` + `lastName`,
 * в других местах может быть `firstName`.
 */
export function formatUserFullNameFromParts(user: unknown): string {
  const u = (user ?? {}) as {
    name?: string | null
    firstName?: string | null
    lastName?: string | null
  }
  const first = (u.name ?? u.firstName)?.trim() ?? ''
  const last = (u.lastName ?? '').trim()
  return [first, last].filter(Boolean).join(' ')
}

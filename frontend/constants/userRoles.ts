/** Подписи ролей пользователя в UI (ключ — значение enum с бэка) */
export const USER_ROLE_LABELS_RU: Record<string, string> = {
  SUPER_ADMIN: 'Супер-администратор',
  TENANT_ADMIN: 'Администратор',
  TOURNAMENT_ADMIN: 'Админ турнира',
  TEAM_ADMIN: 'Админ команды',
  MODERATOR: 'Модератор',
  REFEREE: 'Судья',
  USER: 'Пользователь',
}

export function userRoleLabelRu(role: string): string {
  return USER_ROLE_LABELS_RU[role] ?? role
}

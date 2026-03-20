/** Один пункт-ссылка в меню */
export interface AdminNavLinkItem {
  to: string
  label: string
  icon: string
  exact?: boolean
}

/** Группа с подпунктами */
export interface AdminNavSection {
  id: string
  label: string
  icon: string
  items: AdminNavLinkItem[]
}

export type AdminNavEntry = AdminNavLinkItem | AdminNavSection

export function isNavSection(e: AdminNavEntry): e is AdminNavSection {
  return 'items' in e && Array.isArray((e as AdminNavSection).items)
}

/** Совпадение текущего пути с пунктом меню (exact или префикс с `/`). */
export function adminNavPathMatches(item: AdminNavLinkItem, path: string): boolean {
  if (item.exact) return path === item.to
  if (path === item.to) return true
  return path.startsWith(`${item.to}/`)
}

/** id группы, в которой есть активный подпункт, иначе null. */
export function findActiveAdminNavSectionId(path: string): string | null {
  for (const entry of ADMIN_NAV_ENTRIES) {
    if (!isNavSection(entry)) continue
    if (entry.items.some((item) => adminNavPathMatches(item, path))) {
      return entry.id
    }
  }
  return null
}

/**
 * Структура бокового меню: сначала корневые ссылки, затем группы с подпунктами.
 */
export const ADMIN_NAV_ENTRIES: AdminNavEntry[] = [
  { to: '/admin', label: 'Дашборд', icon: 'pi pi-home', exact: true },
  {
    id: 'people',
    label: 'Участники и команды',
    icon: 'pi pi-users',
    items: [
      { to: '/admin/users', label: 'Пользователи', icon: 'pi pi-user' },
      { to: '/admin/teams', label: 'Команды', icon: 'pi pi-shield' },
      { to: '/admin/players', label: 'Игроки', icon: 'pi pi-id-card' },
      { to: '/admin/team-categories', label: 'Категории команд', icon: 'pi pi-tags' },
    ],
  },
  {
    id: 'competitions',
    label: 'Соревнования',
    icon: 'pi pi-trophy',
    items: [
      { to: '/admin/tournaments', label: 'Турниры', icon: 'pi pi-sitemap' },
      { to: '/admin/matches', label: 'Матчи', icon: 'pi pi-calendar' },
    ],
  },
]

export const statusOptions = [
  { value: 'SCHEDULED', label: 'Запланирован' },
  { value: 'LIVE', label: 'Идёт' },
  { value: 'PLAYED', label: 'Сыгран' },
  { value: 'FINISHED', label: 'Завершён' },
  { value: 'CANCELED', label: 'Отменён' },
] as const

export function statusLabel(status?: string | null) {
  const found = statusOptions.find((s) => s.value === status)
  return found?.label ?? (status ?? '—')
}

export function statusPillClass(status?: string | null) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border'
  switch (status) {
    case 'SCHEDULED':
      return `${base} bg-surface-100 text-surface-800 border-surface-200`
    case 'LIVE':
      return `${base} bg-yellow-50 text-yellow-800 border-yellow-200`
    case 'PLAYED':
      return `${base} bg-indigo-50 text-indigo-800 border-indigo-200`
    case 'FINISHED':
      return `${base} bg-green-50 text-green-800 border-green-200`
    case 'CANCELED':
      return `${base} bg-red-50 text-red-800 border-red-200`
    default:
      return `${base} bg-surface-100 text-surface-800 border-surface-200`
  }
}

export function matchCountLabel(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'матч'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'матча'
  return 'матчей'
}

export const eventTypeOptions = [
  { value: 'GOAL', label: 'Гол' },
  { value: 'CARD', label: 'Карточка' },
  { value: 'SUBSTITUTION', label: 'Замена' },
  { value: 'CUSTOM', label: 'Другое' },
] as const

export const teamSideOptions = [
  { value: 'HOME', label: 'Хозяева' },
  { value: 'AWAY', label: 'Гости' },
] as const

export const formatOptions = [
  { value: 'SINGLE_GROUP', label: 'Одна группа (круговой)' },
  { value: 'GROUPS_2', label: '2 группы' },
  { value: 'GROUPS_3', label: '3 группы' },
  { value: 'GROUPS_4', label: '4 группы' },
  { value: 'PLAYOFF', label: 'Плей-офф' },
  { value: 'GROUPS_PLUS_PLAYOFF', label: 'Группы + плей-офф' },
] as const

export const dayLabels: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  0: 'Вс',
}

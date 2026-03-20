const STORAGE_KEY = 'tournament-admin-sidebar-mini'

/** Компактный (иконки) режим сайдбара, сохраняется в localStorage */
export function useAdminSidebarCollapsed() {
  const mini = ref(false)

  const syncFromStorage = () => {
    if (!import.meta.client) return
    mini.value = localStorage.getItem(STORAGE_KEY) === '1'
  }

  const toggleMini = () => {
    mini.value = !mini.value
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, mini.value ? '1' : '0')
    }
  }

  onMounted(() => {
    syncFromStorage()
  })

  return { mini, toggleMini, syncFromStorage }
}

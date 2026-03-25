const STORAGE_KEY = 'tournament-admin-sidebar-mini'
const mini = ref(false)
let initialized = false

/** Компактный (иконки) режим сайдбара, сохраняется в localStorage */
export function useAdminSidebarCollapsed() {
  const syncFromStorage = () => {
    if (!import.meta.client) return
    mini.value = localStorage.getItem(STORAGE_KEY) === '1'
    initialized = true
  }

  const toggleMini = () => {
    if (import.meta.client && !initialized) {
      syncFromStorage()
    }
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

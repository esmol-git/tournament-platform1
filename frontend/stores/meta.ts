import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAuthStore } from '~/stores/auth'

export interface RoleOption {
  value: string
  label: string
}

/**
 * Справочник ролей для админки. Загрузка идёт через `authStore.authFetch`
 * (единый refresh по 401, без дублирования логики из `stores/auth`).
 */
export const useMetaStore = defineStore('meta', () => {
  const { apiUrl } = useApiUrl()
  const roles = ref<RoleOption[]>([])

  function clearRoles() {
    roles.value = []
  }

  /** Подтянуть роли с сервера (кэш: не дёргаем повторно, пока массив не пустой). */
  async function loadRoles(opts?: { force?: boolean }) {
    if (opts?.force) roles.value = []
    const authStore = useAuthStore()
    if (!authStore.token || roles.value.length) return
    try {
      const res = await authStore.authFetch<RoleOption[]>(apiUrl('/meta/roles'))
      roles.value = res
    } catch {
      // страница не падает; селект ролей будет пустым
    }
  }

  return { roles, loadRoles, clearRoles }
})

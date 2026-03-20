import { computed } from 'vue'
import { useAuth } from './useAuth'

/** `tenantId` текущего пользователя для API tenant-scoped маршрутов */
export function useTenantId() {
  const { user } = useAuth()
  return computed(() => (user.value?.tenantId as string | undefined) ?? 'default')
}

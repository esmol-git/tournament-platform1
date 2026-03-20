import { computed } from 'vue'
import { useRuntimeConfig } from '#app'

/**
 * Базовый URL API из runtimeConfig (NUXT_PUBLIC_API_BASE).
 * Без завершающего слэша.
 */
export function useApiUrl() {
  const config = useRuntimeConfig()

  const apiBase = computed(() =>
    String(config.public.apiBase ?? 'http://localhost:4000').replace(/\/$/, ''),
  )

  /** path должен начинаться с "/", например "/auth/me" */
  function apiUrl(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`
    return `${apiBase.value}${p}`
  }

  return { apiBase, apiUrl }
}

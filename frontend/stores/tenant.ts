import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Публичный сайт: slug тенанта из /[tenant]/… или субдомена.
 * Админка сбрасывает slug (см. tenant.global.ts).
 */
export const useTenantStore = defineStore('tenant', () => {
  const slug = ref<string | null>(null)

  function setTenant(next: string | null) {
    slug.value = next
  }

  return {
    slug,
    setTenant,
  }
})

import { useTenantStore } from '~/stores/tenant'

export default defineNuxtRouteMiddleware((to) => {
  const tenantStore = useTenantStore()

  // В админке (кроме логина) сбрасываем slug — на /admin/login сохраняем для tenantSlug при входе.
  if (to.path.startsWith('/admin') && !to.path.startsWith('/admin/login')) {
    tenantStore.setTenant(null)
    return
  }

  const tenantFromParam = to.params.tenant as string | undefined
  if (tenantFromParam) {
    tenantStore.setTenant(tenantFromParam)
    return
  }

  const hostHeader = useRequestHeaders(['host']).host
  const host = hostHeader?.split(':')[0]?.toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return
  }

  // tenant.example.com → tenant (не трогаем example.com; www — не тенант)
  const parts = host.split('.')
  if (parts.length >= 3) {
    const sub = parts[0]!
    if (sub !== 'www') {
      tenantStore.setTenant(sub)
    }
  }
})

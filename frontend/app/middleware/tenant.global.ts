import { useTenantStore } from '~/stores/tenant'

function tenantFromHost(hostHeader?: string): string | null {
  const host = hostHeader?.split(':')[0]?.toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  // tenant.example.com / tenant.lvh.me -> tenant
  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www') return null
  return sub
}

export default defineNuxtRouteMiddleware((to) => {
  const tenantStore = useTenantStore()
  const hostHeader = useRequestHeaders(['host']).host
  const tenantFromSubdomain = tenantFromHost(hostHeader)

  // Для админки на localhost оставляем явный tenantSlug/дефолт.
  // Для поддоменов (acme.lvh.me/admin) сохраняем tenant из host.
  if (to.path.startsWith('/admin') && !to.path.startsWith('/admin/login')) {
    tenantStore.setTenant(tenantFromSubdomain)
    return
  }

  const tenantFromParam = to.params.tenant as string | undefined
  if (tenantFromParam) {
    tenantStore.setTenant(tenantFromParam)
    return
  }

  tenantStore.setTenant(tenantFromSubdomain)
})

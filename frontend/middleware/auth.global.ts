import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware((to) => {
  // Защищаем только маршруты админки, публичные страницы не трогаем
  if (!to.path.startsWith('/admin')) {
    return
  }

  const { loggedIn, syncWithStorage } = useAuth()

  if (process.client) {
    syncWithStorage()
  }

  const isAuthPage = to.path === '/admin/login'

  if (!loggedIn.value && !isAuthPage) {
    return navigateTo('/admin/login')
  }

  if (loggedIn.value && isAuthPage) {
    return navigateTo('/admin')
  }
})


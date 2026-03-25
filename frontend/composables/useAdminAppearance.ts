import { ru } from 'primelocale/js/ru.js'
import { en } from 'primelocale/js/en.js'
import type { NuxtApp } from '#app'
import type { AdminAccentId, AdminLocaleCode, AdminThemeMode } from '~/constants/adminSettings'
import { useAdminSettingsStore } from '~/stores/adminSettings'

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveDarkClass(themeMode: AdminThemeMode): boolean {
  if (themeMode === 'dark') return true
  if (themeMode === 'light') return false
  return getSystemDark()
}

export function applyAdminThemeAndAccent(opts: {
  themeMode: AdminThemeMode
  accent: AdminAccentId
}) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const dark = resolveDarkClass(opts.themeMode)
  root.classList.toggle('dark-mode', dark)
  root.setAttribute('data-accent', opts.accent)
  /** Режим «системная тема»: повторно применяем после microtask и кадра (WebKit / переключение с фикс. темы). */
  if (opts.themeMode === 'system' && typeof window !== 'undefined') {
    const apply = () =>
      root.classList.toggle('dark-mode', resolveDarkClass('system'))
    queueMicrotask(apply)
    requestAnimationFrame(apply)
  }
}

/** Локаль PrimeVue через `$primevue` — не через `usePrimeVue()` (после `await` в async-хуках inject недоступен). */
export function applyAdminLocale(code: AdminLocaleCode, nuxtApp: NuxtApp) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code === 'ru' ? 'ru' : 'en'
  const pv = nuxtApp.vueApp.config.globalProperties.$primevue as
    | { config?: { locale?: unknown } }
    | undefined
  if (pv?.config) {
    pv.config.locale = code === 'ru' ? ru : en
  }
}

export function bindSystemThemeListener() {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const store = useAdminSettingsStore()
  const handler = () => {
    if (store.themeMode === 'system') {
      applyAdminThemeAndAccent({
        themeMode: store.themeMode,
        accent: store.accent,
      })
    }
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

/** Только тема и акцент (класс dark-mode, data-accent). Локаль — через vue-i18n + applyAdminLocale в layout. */
export function syncThemeAndAccentFromStore() {
  const store = useAdminSettingsStore()
  applyAdminThemeAndAccent({
    themeMode: store.themeMode,
    accent: store.accent,
  })
}


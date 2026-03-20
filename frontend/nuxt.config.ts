// @ts-ignore
import { fileURLToPath } from 'node:url'
import Aura from '@primeuix/themes/aura'
import { ru as primeVueRu } from 'primelocale/js/ru.js'

export default defineNuxtConfig({
  compatibilityDate: '2026-03-17',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@primevue/nuxt-module', '@nuxtjs/tailwindcss'],
  runtimeConfig: {
    public: {
      /** Бэкенд NestJS (переопределяется через NUXT_PUBLIC_API_BASE) */
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000',
      /** Если slug не из стора (прямой заход на /admin/login), см. NUXT_PUBLIC_DEFAULT_TENANT_SLUG */
      defaultTenantSlug: process.env.NUXT_PUBLIC_DEFAULT_TENANT_SLUG || 'default',
    },
  },
  css: ['primeicons/primeicons.css'],
  primevue: {
    options: {
      /** Календарь, дни недели, подписи DatePicker / фильтров — на русском */
      locale: primeVueRu,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark-mode',
        },
      },
    },
  },
  // Tailwind module сам подключает ~/assets/css/tailwind.css по умолчанию
  ssr: true,
  vite: {
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./', import.meta.url)),
        '@': fileURLToPath(new URL('./', import.meta.url))
      }
    }
  },
  app: {
    head: {
      title: 'Tournament Platform',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      htmlAttrs: {
        lang: 'ru',
      },
    },
  },
})
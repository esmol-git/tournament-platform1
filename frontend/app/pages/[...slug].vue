<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({
  // Пусть 404 выглядит одинаково во всех разделах
  layout: 'default',
})

const route = useRoute()

const path = computed(() => String(route.path || ''))

const title = computed(() => 'Страница не найдена')
const subtitle = computed(() => 'Такой страницы нет. Возможно, ссылка устарела или была введена с ошибкой.')

const primaryAction = computed(() => {
  const p = path.value
  if (p.startsWith('/admin')) return { label: 'В админку', to: '/admin' }
  if (p.startsWith('/platform')) return { label: 'В платформу', to: '/platform/login' }

  // Для публичных страниц обычно /{tenant}/...
  const seg = p.split('/').filter(Boolean)[0] ?? ''
  if (seg) return { label: 'К турнирам', to: `/${seg}/table` }
  return { label: 'На главную', to: '/' }
})
</script>

<template>
  <div class="min-h-screen bg-surface-0 flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-xl rounded-2xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-muted-color">404</p>
          <h1 class="mt-2 text-2xl font-semibold text-surface-900">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted-color">
            {{ subtitle }}
          </p>
          <p class="mt-3 text-xs text-muted-color">
            {{ path }}
          </p>
        </div>
        <div
          class="shrink-0 h-11 w-11 rounded-full flex items-center justify-center bg-surface-100 text-surface-700"
          aria-hidden="true"
        >
          <i class="pi pi-search" />
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <NuxtLink :to="primaryAction.to">
          <Button :label="primaryAction.label" icon="pi pi-arrow-left" />
        </NuxtLink>
        <Button label="Назад" icon="pi pi-undo" severity="secondary" outlined @click="$router.back()" />
      </div>
    </div>
  </div>
</template>


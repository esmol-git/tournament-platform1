<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

const route = useRoute()

const statusCode = computed(() => Number(props.error?.statusCode ?? 500) || 500)
const isNotFound = computed(() => statusCode.value === 404)

const title = computed(() => (isNotFound.value ? 'Страница не найдена' : 'Произошла ошибка'))
const subtitle = computed(() => {
  if (isNotFound.value) return 'Проверьте адрес или перейдите в доступный раздел.'
  return 'Попробуйте обновить страницу. Если повторится — сообщите администратору.'
})

const primaryAction = computed(() => {
  const path = String(route.path || '')
  if (path.startsWith('/admin')) return { label: 'В админку', to: '/admin' }
  if (path.startsWith('/platform')) return { label: 'В платформу', to: '/platform/login' }
  return { label: 'На главную', to: '/' }
})

function onGoHome() {
  clearError({ redirect: primaryAction.value.to })
}

function onRetry() {
  clearError()
}
</script>

<template>
  <div class="min-h-screen bg-surface-0 flex items-center justify-center px-4 py-10">
    <div class="w-full max-w-xl rounded-2xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-muted-color">Ошибка {{ statusCode }}</p>
          <h1 class="mt-2 text-2xl font-semibold text-surface-900">{{ title }}</h1>
          <p class="mt-2 text-sm text-muted-color">
            {{ subtitle }}
          </p>
        </div>
        <div
          class="shrink-0 h-11 w-11 rounded-full flex items-center justify-center"
          :class="isNotFound ? 'bg-surface-100 text-surface-700' : 'bg-red-100 text-red-700'"
          aria-hidden="true"
        >
          <i :class="isNotFound ? 'pi pi-search' : 'pi pi-exclamation-triangle'" />
        </div>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <Button
          :label="primaryAction.label"
          icon="pi pi-home"
          @click="onGoHome"
        />
        <Button
          label="Повторить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          @click="onRetry"
        />
      </div>
    </div>
  </div>
</template>


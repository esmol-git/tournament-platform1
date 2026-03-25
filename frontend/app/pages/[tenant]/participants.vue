<script setup lang="ts">
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const { tenantSlug } = usePublicTenantContext()
const tenant = tenantSlug

const blocks = [
  {
    title: 'Команды',
    text: 'Составы команд, категория, рейтинг и текущий статус участия в турнирах.',
    icon: 'pi pi-shield',
  },
  {
    title: 'Игроки',
    text: 'Карточки игроков, позиции, статистика и связь с командой.',
    icon: 'pi pi-users',
  },
  {
    title: 'Тренеры и персонал',
    text: 'Контактные данные и роль в подготовке и сопровождении матчей.',
    icon: 'pi pi-id-card',
  },
]
</script>

<template>
  <div class="min-h-screen bg-surface-50">
    <PublicHeader :tenant="tenant" />

    <section class="mx-auto max-w-6xl px-4 py-8">
      <div class="rounded-2xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
        <p class="text-sm font-medium uppercase tracking-wide text-primary">Участники</p>
        <h1 class="mt-2 text-3xl font-semibold text-surface-900">Команды и игроки</h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-color">
          Раздел с участниками турниров. Здесь отображается структурированная информация по командам,
          игрокам и связанным ролям.
        </p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article
          v-for="item in blocks"
          :key="item.title"
          class="rounded-xl border border-surface-200 bg-surface-0 p-4"
        >
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span :class="[item.icon, 'text-base']" aria-hidden="true" />
          </div>
          <h2 class="mt-3 text-lg font-semibold text-surface-900">{{ item.title }}</h2>
          <p class="mt-2 text-sm text-muted-color">{{ item.text }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

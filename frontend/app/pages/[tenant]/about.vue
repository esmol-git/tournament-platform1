<script setup lang="ts">
import PublicHeader from '~/app/components/public/PublicHeader.vue'

import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const { tenantSlug } = usePublicTenantContext()
const tenant = tenantSlug
</script>

<template>
  <div class="min-h-screen bg-surface-50">
    <PublicHeader :tenant="tenant" />

    <section class="mx-auto max-w-6xl px-4 py-8">
      <div class="rounded-2xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
        <p class="text-sm font-medium uppercase tracking-wide text-primary">О лиге</p>
        <h1 class="mt-2 text-3xl font-semibold text-surface-900">Единая площадка турниров</h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-color">
          Здесь публикуются результаты турниров, календарь матчей, статистика игроков и ключевые новости
          сезона. Раздел помогает быстро ориентироваться в расписании и следить за развитием соревнований.
        </p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="text-lg font-semibold text-surface-900">Прозрачность</h2>
          <p class="mt-2 text-sm text-muted-color">
            Таблицы, статусы матчей и итоги плей-офф обновляются в одном месте.
          </p>
        </article>
        <article class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="text-lg font-semibold text-surface-900">Удобная навигация</h2>
          <p class="mt-2 text-sm text-muted-color">
            Быстрый переход между турнирами, участниками, календарем и медиаматериалами.
          </p>
        </article>
        <article class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="text-lg font-semibold text-surface-900">Актуальная информация</h2>
          <p class="mt-2 text-sm text-muted-color">
            Организаторы обновляют данные в админке, а публика сразу видит изменения.
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

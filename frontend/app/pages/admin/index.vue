<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header>
      <h1 class="text-2xl font-semibold text-surface-900">
        Админ‑панель
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        Здесь будет дашборд организатора турниров.
      </p>
    </header>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
        <h2 class="mb-1 text-sm font-medium text-surface-800">
          Турниры
        </h2>
        <p class="text-xs text-muted-color">
          Управление турнирами, расписанием и сеткой матчей.
        </p>
      </div>

      <div class="rounded-xl border border-surface-200 bg-surface-0 p-4">
        <h2 class="mb-1 text-sm font-medium text-surface-800">
          Матчи
        </h2>
        <p class="text-xs text-muted-color">
          Быстрый доступ к ближайшим и прошедшим матчам.
        </p>
      </div>
    </div>
  </section>
</template>


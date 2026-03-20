<script setup lang="ts">
const props = defineProps<{
  tenant: string
}>()
</script>

<template>
  <header class="w-full bg-surface-0 border-b border-surface-200">
    <div class="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <span class="font-semibold text-primary">UF</span>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-semibold text-surface-900 truncate">Tournament Platform</div>
          <div class="text-xs text-muted-color truncate">Публичные страницы</div>
        </div>
      </div>

      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-surface-800">
        <NuxtLink class="hover:text-primary transition-colors" to="/">О ЛИГЕ</NuxtLink>
        <NuxtLink class="hover:text-primary transition-colors" :to="`/${props.tenant}/table`">ТУРНИРЫ</NuxtLink>
        <NuxtLink class="hover:text-primary transition-colors" to="/">УЧАСТНИКИ</NuxtLink>
        <NuxtLink class="hover:text-primary transition-colors" to="/">МЕДИА</NuxtLink>
      </nav>
    </div>
  </header>
</template>


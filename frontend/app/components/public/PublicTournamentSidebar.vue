<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tenant: string
  tid?: string | null
  tournamentName?: string | null
  active: 'table' | 'calendar' | 'players'
}>()

const baseQuery = computed(() => {
  const q: Record<string, string> = {}
  if (props.tid) q.tid = props.tid
  return q
})
</script>

<template>
  <aside class="rounded-2xl border border-surface-200 bg-surface-0 overflow-hidden">
    <div class="p-3 bg-surface-100 border-b border-surface-200">
      <div class="text-xs uppercase tracking-wide text-muted-color">О ТУРНИРЕ</div>
      <div v-if="tournamentName" class="mt-2 font-semibold text-surface-900 truncate">
        {{ tournamentName }}
      </div>
      <div v-else class="mt-2 font-semibold text-surface-900 truncate">
        Турнир
      </div>
    </div>

    <nav class="p-2 space-y-1">
      <NuxtLink
        :to="`/${tenant}/calendar`"
        :query="baseQuery"
        class="block px-3 py-2 rounded-lg text-sm transition-colors"
        :class="active === 'calendar' ? 'bg-primary/90 text-white' : 'hover:bg-surface-100 text-surface-700'"
      >
        Календарь
      </NuxtLink>

      <NuxtLink
        :to="`/${tenant}/table`"
        :query="baseQuery"
        class="block px-3 py-2 rounded-lg text-sm transition-colors"
        :class="active === 'table' ? 'bg-primary/90 text-white' : 'hover:bg-surface-100 text-surface-700'"
      >
        Турнирная таблица
      </NuxtLink>

      <NuxtLink
        :to="`/${tenant}/scorers`"
        :query="baseQuery"
        class="block px-3 py-2 rounded-lg text-sm transition-colors"
        :class="active === 'players' ? 'bg-primary/90 text-white' : 'hover:bg-surface-100 text-surface-700'"
      >
        Статистика игроков
      </NuxtLink>

      <div class="mt-3 pt-2 border-t border-surface-200">
        <div class="px-3 text-xs uppercase tracking-wide text-muted-color mb-2">Разделы</div>
        <div class="space-y-1">
          <div class="px-3 py-2 text-sm text-muted-color">Команды (скоро)</div>
          <div class="px-3 py-2 text-sm text-muted-color">Новости (скоро)</div>
          <div class="px-3 py-2 text-sm text-muted-color">Фото (скоро)</div>
          <div class="px-3 py-2 text-sm text-muted-color">Видео (скоро)</div>
          <div class="px-3 py-2 text-sm text-muted-color">Документы (скоро)</div>
        </div>
      </div>
    </nav>

    <div class="p-3 border-t border-surface-200">
      <div class="flex items-center gap-2 justify-start">
        <a href="#" class="h-8 w-8 rounded-full border border-surface-200 flex items-center justify-center text-muted-color hover:text-primary" @click.prevent>
          <i class="pi pi-facebook" />
        </a>
        <a href="#" class="h-8 w-8 rounded-full border border-surface-200 flex items-center justify-center text-muted-color hover:text-primary" @click.prevent>
          <i class="pi pi-twitter" />
        </a>
        <a href="#" class="h-8 w-8 rounded-full border border-surface-200 flex items-center justify-center text-muted-color hover:text-primary" @click.prevent>
          <i class="pi pi-link" />
        </a>
      </div>
    </div>
  </aside>
</template>


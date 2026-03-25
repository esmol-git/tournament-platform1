<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const { tenantSlug } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchMediaFeed } = usePublicTournamentFetch()

/** Пока API возвращает пустой массив; позже — записи из БД. */
const remoteItems = ref<unknown[]>([])

onMounted(async () => {
  try {
    const res = await fetchMediaFeed(tenant.value)
    remoteItems.value = res.items ?? []
  } catch {
    remoteItems.value = []
  }
})

const placeholderItems = [
  { title: 'Фотоотчеты туров', subtitle: 'Подборки с игровых дней' },
  { title: 'Видео лучших моментов', subtitle: 'Голы, сейвы и ключевые эпизоды' },
  { title: 'Интервью и комментарии', subtitle: 'Мнения игроков и тренеров' },
]

const mediaItems = computed(() =>
  remoteItems.value.length ? remoteItems.value : placeholderItems,
)
</script>

<template>
  <div class="min-h-screen bg-surface-50">
    <PublicHeader :tenant="tenant" />

    <section class="mx-auto max-w-6xl px-4 py-8">
      <div class="rounded-2xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
        <p class="text-sm font-medium uppercase tracking-wide text-primary">Медиа</p>
        <h1 class="mt-2 text-3xl font-semibold text-surface-900">Контент турниров</h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-color">
          В этом разделе собираются фото, видео и материалы по турнирам. Можно использовать как ленту
          новостей и архив по сезонам.
        </p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article
          v-for="(item, idx) in mediaItems"
          :key="'title' in item ? item.title : `m-${idx}`"
          class="rounded-xl border border-surface-200 bg-surface-0 p-4"
        >
          <div class="aspect-[16/9] rounded-lg bg-surface-100 dark:bg-surface-800" />
          <h2 class="mt-3 text-lg font-semibold text-surface-900">
            {{ typeof item === 'object' && item && 'title' in item ? String(item.title) : 'Материал' }}
          </h2>
          <p class="mt-1 text-sm text-muted-color">
            {{
              typeof item === 'object' && item && 'subtitle' in item
                ? String(item.subtitle)
                : ''
            }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

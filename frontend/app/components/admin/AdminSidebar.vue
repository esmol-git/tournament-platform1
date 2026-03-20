<script setup lang="ts">
import {
  ADMIN_NAV_ENTRIES,
  findActiveAdminNavSectionId,
  isNavSection,
} from '~/constants/adminNav'
import { useAdminSidebarCollapsed } from '~/composables/useAdminSidebarCollapsed'
import { useAuth } from '~/composables/useAuth'

const emit = defineEmits<{
  'logout-click': []
}>()

const { token, user, fetchMe, syncWithStorage } = useAuth()
const { mini, toggleMini } = useAdminSidebarCollapsed()
const route = useRoute()

/** Аккордеон: одна раскрытая группа; при смене маршрута — открывается секция с активным подпунктом. */
const openSectionId = ref<string | null>(null)

watch(
  () => route.path,
  (path) => {
    openSectionId.value = findActiveAdminNavSectionId(path)
  },
  { immediate: true },
)

const siteLink = computed(() => {
  const tenant = (user.value?.tenantId as string | undefined) ?? 'default'
  return `/${tenant}/table`
})

onMounted(async () => {
  syncWithStorage()
  if (token.value && !user.value) {
    try {
      await fetchMe()
    } catch {
      // токен протух — guard/login разрулит
    }
  }
})
</script>

<template>
  <aside
    :class="[
      'sticky top-0 flex h-screen flex-col justify-between border-r border-surface-200 bg-surface-0 py-4 transition-[width] duration-200 ease-out',
      mini ? 'w-[4.25rem] px-2' : 'w-64 px-4',
    ]"
  >
    <div class="min-h-0 flex flex-1 flex-col">
      <!-- Шапка -->
      <div
        :class="[
          'shrink-0',
          mini ? 'flex flex-col items-center gap-3' : 'flex items-start justify-between gap-2',
        ]"
      >
        <div v-if="!mini" class="min-w-0 flex-1">
          <h1 class="text-sm font-semibold text-surface-900">
            Admin · Tournament Platform
          </h1>
          <p class="mt-1 text-xs text-muted-color">
            Панель организатора
          </p>
          <p v-if="user" class="mt-2 line-clamp-2 break-all text-xs text-muted-color">
            {{ user.email }} · {{ user.role }}
          </p>
        </div>
        <div
          v-else
          class="flex flex-col items-center gap-1"
          title="Tournament Platform Admin"
        >
          <span class="pi pi-th-large text-lg text-primary" aria-hidden="true" />
        </div>

        <Button
          v-if="!mini"
          type="button"
          icon="pi pi-angle-double-left"
          text
          rounded
          severity="secondary"
          class="shrink-0"
          title="Свернуть панель"
          aria-label="Свернуть панель"
          @click="toggleMini"
        />
        <Button
          v-else
          type="button"
          icon="pi pi-angle-double-right"
          text
          rounded
          severity="secondary"
          class="!h-9 !w-9"
          title="Развернуть панель"
          aria-label="Развернуть панель"
          @click="toggleMini"
        />
      </div>

      <!-- Навигация -->
      <nav
        class="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto text-sm"
        :class="mini ? 'flex flex-col items-stretch' : ''"
      >
        <div
          v-for="entry in ADMIN_NAV_ENTRIES"
          :key="isNavSection(entry) ? entry.id : entry.to"
          class="contents"
        >
          <AdminNavGroup
            v-if="isNavSection(entry)"
            :section-id="entry.id"
            :label="entry.label"
            :icon="entry.icon"
            :items="entry.items"
            :mini="mini"
            :open-section-id="openSectionId"
            @update:open-section-id="openSectionId = $event"
          />
          <AdminNavLink
            v-else
            :to="entry.to"
            :label="entry.label"
            :icon="entry.icon"
            :exact="!!entry.exact"
            :mini="mini"
          />
        </div>

        <NuxtLink
          :to="siteLink"
          class="flex items-center gap-2 rounded-lg text-muted-color transition-colors hover:bg-surface-100 hover:text-primary"
          :class="mini ? 'justify-center px-2 py-2.5' : 'px-3 py-2'"
          title="На сайт"
        >
          <span class="pi pi-external-link text-xs" :class="{ 'text-base': mini }" aria-hidden="true" />
          <span v-if="!mini">На сайт</span>
        </NuxtLink>
      </nav>
    </div>

    <div
      class="mt-4 shrink-0 border-t border-surface-200 pt-3"
      :class="mini ? 'flex justify-center' : ''"
    >
      <Button
        :label="mini ? undefined : 'Выйти'"
        icon="pi pi-sign-out"
        text
        :class="mini ? '!h-10 !w-10 !p-0' : 'w-full justify-start !px-3 !py-2'"
        :title="mini ? 'Выйти' : undefined"
        aria-label="Выйти"
        @click="emit('logout-click')"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import {
  ADMIN_NAV_ENTRIES,
  findActiveAdminNavSectionId,
  isNavSection,
} from '~/constants/adminNav'
import { useAdminSidebarCollapsed } from '~/composables/useAdminSidebarCollapsed'
import { useAuth } from '~/composables/useAuth'
import { userRoleLabelRu } from '~/constants/userRoles'
import { formatUserFullNameFromParts } from '~/utils/userDisplayName'
import { useTenantStore } from '~/stores/tenant'
import { storeToRefs } from 'pinia'

const emit = defineEmits<{
  'logout-click': []
}>()

const { user, syncWithStorage } = useAuth()
const { mini } = useAdminSidebarCollapsed()
const route = useRoute()
const { t } = useI18n()

const tenantStore = useTenantStore()
const { slug: tenantSlugFromStore } = storeToRefs(tenantStore)

function tenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase()
  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www' || sub === 'localhost' || sub === '127.0.0.1') return null
  return sub
}

/** До onMounted не используем user из localStorage — совпадает с SSR. */
const clientMounted = ref(false)

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
  const fromStore = tenantSlugFromStore.value
  const fromHost =
    process.client ? tenantSlugFromHostname(window.location.hostname) : null
  const slug = fromStore || fromHost
  return slug ? `/${slug}/table` : null
})

const userDisplayName = computed(() => {
  const u = (user.value ?? {}) as { email?: string | null }
  const full = formatUserFullNameFromParts(user.value)
  if (full) return full
  const email = u.email ?? ''
  if (!email) return 'Пользователь'
  return email.split('@')[0] || email
})

const userInitials = computed(() => {
  const parts = userDisplayName.value
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
  return parts
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('')
})

/** Сброс при смене пользователя; при битой ссылке на фото — только буквы (Avatar label). */
const avatarImageFailed = ref(false)
watch(
  () => (user.value as { id?: string } | null)?.id,
  () => {
    avatarImageFailed.value = false
  },
)

const userAvatarSrc = computed(() => {
  if (avatarImageFailed.value) return undefined
  const u = user.value as { avatarUrl?: string | null; image?: string | null } | null
  if (!u) return undefined
  const src = (u.avatarUrl ?? u.image ?? '').trim()
  return src || undefined
})

function onAvatarImageError() {
  avatarImageFailed.value = true
}

onMounted(async () => {
  clientMounted.value = true
  syncWithStorage()
  // Для ссылки на публичный сайт ориентируемся на `tenantStore.slug`, который задаёт middleware
  // по поддомену. Поэтому `fetchMe()` здесь не обязателен.
})
</script>

<template>
  <aside
    :class="[
      'sticky top-0 z-20 flex h-screen flex-col justify-between border-r border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 py-4 shadow-[2px_0_14px_rgba(15,23,42,0.06)] dark:shadow-[2px_0_16px_rgba(0,0,0,0.35)] transition-[width] duration-200 ease-out',
      mini ? 'w-[4.5rem] px-2' : 'w-80 px-5',
    ]"
  >
    <div class="min-h-0 flex flex-1 flex-col">
      <!-- Навигация -->
      <nav
        class="mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto text-base"
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
            :label-key="entry.labelKey"
            :icon="entry.icon"
            :items="entry.items"
            :mini="mini"
            :open-section-id="openSectionId"
            @update:open-section-id="openSectionId = $event"
          />
          <AdminNavLink
            v-else
            :to="entry.to"
            :label-key="entry.labelKey"
            :icon="entry.icon"
            :exact="!!entry.exact"
            :mini="mini"
          />
        </div>

        <NuxtLink
          v-if="siteLink"
          :to="siteLink"
          class="flex items-center gap-2.5 rounded-lg text-muted-color transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-primary"
          :class="mini ? 'justify-center px-2 py-2.5' : 'px-3.5 py-2.5 text-[15px]'"
          :title="t('admin.sidebar.to_site')"
        >
          <span class="pi pi-external-link text-xs" :class="{ 'text-[1.35rem]': mini }" aria-hidden="true" />
          <span v-if="!mini">{{ t('admin.sidebar.to_site') }}</span>
        </NuxtLink>
      </nav>
    </div>

    <div
      class="mt-4 shrink-0 border-t border-surface-200 dark:border-surface-700 pt-3"
      :class="mini ? 'flex justify-center' : ''"
    >
      <div
        v-if="user && clientMounted"
        class="mb-2 flex items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 px-2.5 py-2 dark:border-surface-700 dark:bg-surface-800/50"
        :class="mini ? 'justify-center border-none bg-transparent px-0' : ''"
      >
        <Avatar
          :image="userAvatarSrc"
          :label="userAvatarSrc ? undefined : (userInitials || 'U')"
          shape="circle"
          size="normal"
          class="!h-9 !w-9 shrink-0"
          :pt="{
            root: {
              class: userAvatarSrc
                ? undefined
                : 'bg-primary-100 text-primary dark:bg-primary-900/50 dark:text-primary-200',
            },
          }"
          :title="userDisplayName"
          :aria-label="userDisplayName"
          @error="onAvatarImageError"
        />
        <div v-if="!mini" class="min-w-0">
          <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-0">
            {{ userDisplayName }}
          </p>
          <p class="truncate text-xs text-muted-color">
            {{ userRoleLabelRu(String(user.role ?? '')) }}
          </p>
        </div>
      </div>
      <Button
        :label="mini ? undefined : t('admin.sidebar.logout')"
        icon="pi pi-sign-out"
        text
        :class="mini ? '!h-10 !w-10 !p-0' : 'w-full justify-start !px-3 !py-2'"
        :title="mini ? t('admin.sidebar.logout') : undefined"
        :aria-label="t('admin.sidebar.logout')"
        @click="emit('logout-click')"
      />
    </div>
  </aside>
</template>

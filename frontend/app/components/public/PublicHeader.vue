<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  tenant: string
}>()

const mobileMenuOpen = ref(false)
const route = useRoute()

/** Единый список пунктов: десктоп и выезжающее меню */
const navLinks = computed(() => [
  {
    label: 'О ЛИГЕ',
    to: `/${props.tenant}/about`,
    activePrefixes: [`/${props.tenant}/about`],
  },
  {
    label: 'ТУРНИРЫ',
    to: `/${props.tenant}/table`,
    activePrefixes: [
      `/${props.tenant}/table`,
      `/${props.tenant}/calendar`,
      `/${props.tenant}/scorers`,
      `/${props.tenant}/match-`,
    ],
  },
  {
    label: 'УЧАСТНИКИ',
    to: `/${props.tenant}/participants`,
    activePrefixes: [`/${props.tenant}/participants`],
  },
  {
    label: 'МЕДИА',
    to: `/${props.tenant}/media`,
    activePrefixes: [`/${props.tenant}/media`],
  },
])

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

const isActive = (link: { to: string; activePrefixes?: string[] }) => {
  const prefixes = link.activePrefixes?.length ? link.activePrefixes : [link.to]
  return prefixes.some((prefix) =>
    route.path === prefix ||
    route.path.startsWith(`${prefix}/`) ||
    (prefix.endsWith('-') && route.path.startsWith(prefix)),
  )
}
</script>

<template>
  <header class="w-full border-b border-[#d0d7e2] shadow-[0_6px_14px_rgba(15,23,42,0.1)]">
    <div class="bg-[#123c67] text-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-white shadow-sm">
            <span class="text-2xl font-semibold text-[#2d8a57]">UF</span>
          </div>
          <div class="min-w-0">
            <p class="truncate text-lg font-semibold tracking-wide">КФК</p>
            <p class="truncate text-xs text-white/75">Лига и турниры</p>
          </div>
        </div>
        <Button
          class="md:!hidden !text-white"
          icon="pi pi-bars"
          text
          rounded
          aria-label="Открыть меню"
          @click="mobileMenuOpen = true"
        />
      </div>
    </div>

    <div class="bg-[#1a5a8c] border-t border-white/10">
      <div class="mx-auto hidden max-w-6xl items-stretch px-4 md:flex">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to + link.label"
          :to="link.to"
          class="relative min-w-[140px] px-6 py-3 text-center text-xs font-semibold tracking-wide text-white/90 transition-colors"
          :class="isActive(link) ? 'bg-[#c80a48] text-white' : 'hover:bg-[#24679e]'"
        >
          <span>{{ link.label }}</span>
          <span
            v-if="isActive(link)"
            class="pointer-events-none absolute -right-4 top-0 h-full w-4 bg-[#c80a48]"
            style="clip-path: polygon(0 0, 100% 50%, 0 100%)"
          />
        </NuxtLink>
      </div>
    </div>

    <Drawer
      :visible="mobileMenuOpen"
      @update:visible="(v) => (mobileMenuOpen = v)"
      position="right"
      header="Разделы"
      class="!w-[min(100vw,18rem)]"
    >
      <nav class="flex flex-col gap-1 text-base font-medium text-surface-800">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to + link.label"
          class="block rounded-lg px-3 py-3 transition-colors"
          :class="
            isActive(link)
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-surface-100'
          "
          :to="link.to"
          @click="closeMobileMenu"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
    </Drawer>
  </header>
</template>

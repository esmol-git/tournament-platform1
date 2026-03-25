<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const router = useRouter()
const { clearSession } = useAuth()

function logout() {
  clearSession()
  router.push('/platform/login')
}
</script>

<template>
  <div class="min-h-screen bg-surface-50 text-surface-900">
    <Toast position="top-right" />
    <header class="border-b border-surface-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <h1 class="text-lg font-semibold">Platform Admin</h1>
        <Button label="Выйти" icon="pi pi-sign-out" severity="secondary" text @click="logout" />
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-6 py-6">
      <slot />
    </main>
  </div>
</template>

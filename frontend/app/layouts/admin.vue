<script setup lang="ts">
const confirmLogout = ref(false)
</script>

<template>
  <div class="flex min-h-screen bg-surface-50">
    <Toast position="top-right" />

    <AdminSidebar @logout-click="confirmLogout = true" />

    <main class="flex-1">
      <slot />
    </main>

    <AdminLogoutDialog v-model="confirmLogout" />
  </div>
</template>

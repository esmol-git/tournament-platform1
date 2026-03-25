<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const route = useRoute()
const router = useRouter()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const matchId = computed(() => route.params.id as string)

onMounted(async () => {
  await ensureTenantResolved()
  if (tenantNotFound.value) return
  if (String(route.params.tenant ?? '') !== tenant.value) {
    await router.replace({ params: { tenant: tenant.value }, query: route.query })
  }
})
</script>

<template>
  <section>
    <h2>Матч {{ matchId }} · {{ tenant }}</h2>
    <p>Здесь будет подробная информация о матче.</p>
  </section>
</template>


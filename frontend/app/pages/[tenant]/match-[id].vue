<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const tenant = computed(() => route.params.tenant as string)
const matchId = computed(() => route.params.id as string)
</script>

<template>
  <section>
    <h2>Матч {{ matchId }} · {{ tenant }}</h2>
    <p>Здесь будет подробная информация о матче.</p>
  </section>
</template>


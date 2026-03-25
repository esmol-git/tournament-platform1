<script setup lang="ts">
import Message from 'primevue/message'

defineProps<{
  titleKey: string
  descriptionKey?: string
}>()

const { t } = useI18n()
</script>

<template>
  <section class="p-6 space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ t(titleKey) }}
      </h1>
      <p v-if="descriptionKey" class="mt-1 text-sm text-muted-color">
        {{ t(descriptionKey) }}
      </p>
      <p v-else class="mt-1 text-sm text-muted-color">
        {{ t('admin.stub.placeholder') }}
      </p>
    </div>

    <Message severity="info" :closable="false" class="w-full">
      {{ t('admin.stub.info') }}
    </Message>
  </section>
</template>

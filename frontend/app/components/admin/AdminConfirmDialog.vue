<script setup lang="ts">
/**
 * Подтверждение действий вместо window.confirm (PrimeVue Dialog).
 */
const visible = defineModel<boolean>({ default: false })

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    /** danger — удаление; warn — открепление и др. */
    confirmSeverity?: 'danger' | 'warn' | 'secondary'
  }>(),
  {
    confirmLabel: 'Удалить',
    cancelLabel: 'Отмена',
    confirmSeverity: 'danger',
  },
)

const emit = defineEmits<{ confirm: [] }>()

function onConfirm() {
  visible.value = false
  emit('confirm')
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    :style="{ width: '26rem' }"
    :draggable="false"
    @update:visible="(v) => (visible = v)"
  >
    <p class="mb-4 text-sm text-muted-color whitespace-pre-wrap">
      {{ message }}
    </p>
    <div class="flex justify-end gap-2">
      <Button :label="cancelLabel" text class="px-3 py-2" @click="visible = false" />
      <Button
        :label="confirmLabel"
        :severity="confirmSeverity"
        class="px-3 py-2"
        @click="onConfirm"
      />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { useAdminLogout } from '~/composables/useAdminLogout'

const visible = defineModel<boolean>({ default: false })

const { logout } = useAdminLogout()

const onConfirm = async () => {
  visible.value = false
  await logout()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Подтверждение выхода"
    :style="{ width: '24rem' }"
    @update:visible="(v) => (visible = v)"
  >
    <p class="mb-4 text-sm text-muted-color">
      Вы уверены, что хотите выйти из админ‑панели?
    </p>
    <div class="flex justify-end gap-2">
      <Button
        label="Отмена"
        text
        class="px-3 py-2"
        @click="visible = false"
      />
      <Button
        label="Выйти"
        severity="danger"
        class="px-3 py-2"
        @click="onConfirm"
      />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { useAdminLogout } from '~/composables/useAdminLogout'

const visible = defineModel<boolean>({ default: false })

const { logout } = useAdminLogout()
const { t } = useI18n()

const onConfirm = async () => {
  visible.value = false
  await logout()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('admin.logout.title')"
    :style="{ width: '24rem' }"
    @update:visible="(v) => (visible = v)"
  >
    <p class="mb-4 text-sm text-muted-color">
      {{ t('admin.logout.message') }}
    </p>
    <div class="flex justify-end gap-2">
      <Button
        :label="t('admin.logout.cancel')"
        text
        class="px-3 py-2"
        @click="visible = false"
      />
      <Button
        :label="t('admin.logout.confirm')"
        severity="danger"
        class="px-3 py-2"
        @click="onConfirm"
      />
    </div>
  </Dialog>
</template>

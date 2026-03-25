<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({
  layout: 'auth',
})

const router = useRouter()
const { apiUrl } = useApiUrl()
const { setSession } = useAuth()

const username = ref('platform_admin')
const password = ref('123456')
const loading = ref(false)
const error = ref<string | null>(null)

async function submit() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ accessToken: string; refreshToken: string; user: unknown }>(
      apiUrl('/auth/platform/login'),
      {
        method: 'POST',
        body: {
          username: username.value.trim(),
          password: password.value,
        },
      },
    )
    setSession(res.accessToken, res.refreshToken, res.user)
    await router.push('/platform/tenants')
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Platform auth failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-md flex-col gap-6">
    <header class="space-y-2">
      <h2 class="text-2xl font-semibold text-surface-900">
        Platform Login
      </h2>
      <p class="text-sm text-muted-color">
        Вход для глобального администратора платформы.
      </p>
    </header>

    <div class="flex flex-col gap-4">
      <FloatLabel variant="on">
        <InputText id="platformUsername" v-model="username" class="w-full" />
        <label for="platformUsername">Логин</label>
      </FloatLabel>

      <FloatLabel variant="on" class="block w-full">
        <Password
          inputId="platformPassword"
          v-model="password"
          toggleMask
          :feedback="false"
          class="block w-full"
          inputClass="w-full"
        />
        <label for="platformPassword">Пароль</label>
      </FloatLabel>

      <p v-if="error" class="text-sm text-danger-500">
        {{ error }}
      </p>

      <Button
        label="Войти"
        icon="pi pi-check"
        :loading="loading"
        class="w-full justify-center"
        @click="submit"
      />
    </div>
  </section>
</template>

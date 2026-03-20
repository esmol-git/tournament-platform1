<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantStore } from '~/stores/tenant'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({
  layout: 'auth',
})

const router = useRouter()
const config = useRuntimeConfig()
const tenantStore = useTenantStore()
const { apiUrl } = useApiUrl()
const { setSession } = useAuth()

/** Slug из публичного /[tenant]/… или NUXT_PUBLIC_DEFAULT_TENANT_SLUG */
const tenantSlugForAuth = computed(
  () => tenantStore.slug ?? String(config.public.defaultTenantSlug ?? 'default'),
)

const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const email = ref('test@test.dd')
const password = ref('123456')
const name = ref('')
const error = ref<string | null>(null)

const toggleMode = () => {
  error.value = null
  mode.value = mode.value === 'login' ? 'register' : 'login'
}

const submit = async () => {
  loading.value = true
  error.value = null
  try {
    const endpoint =
      mode.value === 'login' ? '/auth/login' : '/auth/register'

    const body: any = {
      email: email.value,
      password: password.value,
      tenantSlug: tenantSlugForAuth.value,
    }
    if (mode.value === 'register') {
      body.name = name.value || email.value
    }

    const res = await $fetch<{ accessToken: string; refreshToken: string; user: any }>(
      apiUrl(endpoint),
      {
        method: 'POST',
        body,
      },
    )

    setSession(res.accessToken, res.refreshToken, res.user)
    await router.push('/admin')
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Auth failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="space-y-2">
      <h2 class="text-2xl font-semibold text-surface-900">
        {{ mode === 'login' ? 'Вход для организаторов' : 'Регистрация организатора' }}
      </h2>
      <p class="text-sm text-muted-color">
        Тестовая форма авторизации против NestJS API (порт 4000).
      </p>
    </header>

    <div class="flex flex-col gap-4">
      <div v-if="mode === 'register'">
        <FloatLabel variant="on">
          <InputText id="name" v-model="name" class="w-full" />
          <label for="name">Имя</label>
        </FloatLabel>
      </div>

      <div>
        <FloatLabel variant="on">
          <InputText id="email" v-model="email" type="email" class="w-full" />
          <label for="email">Email</label>
        </FloatLabel>
      </div>

      <div class="w-full">
        <FloatLabel variant="on" class="block w-full">
          <Password
            inputId="password"
            v-model="password"
            toggleMask
            :feedback="false"
            class="block w-full"
            inputClass="w-full"
          />
          <label for="password">Пароль</label>
        </FloatLabel>
      </div>

      <p v-if="error" class="text-sm text-danger-500">
        {{ error }}
      </p>

      <div class="mt-2 flex flex-col gap-2">
        <Button
          :label="mode === 'login' ? 'Войти' : 'Зарегистрироваться'"
          icon="pi pi-check"
          :loading="loading"
          class="w-full justify-center"
          @click="submit"
        />

        <div class="text-center">
          <Button
            link
            :label="mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'"
            class="text-primary"
            @click="toggleMode"
          />
        </div>
      </div>
    </div>
  </section>
</template>

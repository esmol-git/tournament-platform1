<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { USER_ROLE_LABELS_RU, userRoleLabelRu } from '~/constants/userRoles'
import { useMetaStore } from '~/stores/meta'
import type { UserRow } from '~/types/admin/user'

definePageMeta({
  layout: 'admin',
})

const router = useRouter()
const { token, syncWithStorage, loggedIn, authFetch, fetchMe } = useAuth()
const { apiUrl } = useApiUrl()
const metaStore = useMetaStore()

const roleOptionsRu = computed(() =>
  metaStore.roles.map((r) => ({
    value: r.value,
    label: USER_ROLE_LABELS_RU[r.value] ?? r.label ?? r.value,
  })),
)

const loading = ref(false)
const users = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const role = ref<string | ''>('')

const showForm = ref(false)
const editingUser = ref<UserRow | null>(null)

const form = reactive({
  email: '',
  name: '',
  lastName: '',
  password: '',
  role: 'USER',
})

const isEdit = computed(() => !!editingUser.value)

const fetchUsers = async () => {
  if (!token.value) return
  loading.value = true
  try {
    const res = await authFetch<{
      items: UserRow[]
      total: number
      page: number
      pageSize: number
    }>(apiUrl('/users'), {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        search: search.value || undefined,
        role: role.value || undefined,
      },
    })

    users.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingUser.value = null
  form.email = ''
  form.name = ''
  form.lastName = ''
  form.password = ''
  form.role = 'USER'
  showForm.value = true
}

const openEdit = (user: UserRow) => {
  editingUser.value = user
  form.email = user.email
  form.name = user.name
  form.lastName = user.lastName ?? ''
  form.password = ''
  form.role = user.role
  showForm.value = true
}

const saveUser = async () => {
  if (!token.value) return
  const body: any = {
    name: form.name,
    lastName: form.lastName.trim(),
    role: form.role,
  }

  if (!isEdit.value) {
    body.email = form.email
    body.password = form.password
  } else if (form.password) {
    body.password = form.password
  }

  if (isEdit.value) {
    await authFetch(apiUrl(`/users/${editingUser.value!.id}`), {
      method: 'PATCH',
      body,
    })
  } else {
    await authFetch(apiUrl('/users'), {
      method: 'POST',
      body,
    })
  }

  showForm.value = false
  await fetchUsers()
}

const deleteUser = async (user: UserRow) => {
  if (!token.value) return
  if (!confirm(`Удалить пользователя ${user.email}?`)) return

  await authFetch(apiUrl(`/users/${user.id}`), {
    method: 'DELETE',
  })
  await fetchUsers()
}

const toggleBlock = async (user: UserRow) => {
  if (!token.value) return

  await authFetch(apiUrl(`/users/${user.id}/block`), {
    method: 'POST',
    body: { blocked: !user.blocked },
  })
  await fetchUsers()
}

watch([page, pageSize, role], () => {
  fetchUsers()
})

watch(search, () => {
  page.value = 1
  fetchUsers()
})

/** Если фильтр уменьшил total, не оставаться на несуществующей странице */
watch([total, pageSize], ([t, ps]) => {
  if (t <= 0) return
  const maxPage = Math.max(1, Math.ceil(t / ps))
  if (page.value > maxPage) {
    page.value = maxPage
  }
})

const usersTableFirst = computed(() => (page.value - 1) * pageSize.value)

const onUsersPage = (event: { first?: number; rows?: number }) => {
  const rows = Number(event.rows ?? pageSize.value) || pageSize.value
  const first = Number(event.first ?? 0)
  pageSize.value = rows > 0 ? rows : pageSize.value
  page.value = Math.floor(first / pageSize.value) + 1
  // fetchUsers вызовет watch([page, pageSize, role])
}

/** Пагинация только если записей больше 10 */
const showUsersPaginator = computed(() => total.value > 10)

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
    // Попробуем обновить access токен и только потом грузим справочник ролей.
    // Если refresh не сработал — отдадим роли без обновления (пользователь всё равно будет на странице).
    fetchMe()
      .catch(() => null)
      .finally(() => {
        void metaStore.loadRoles()
      })
  }
  fetchUsers()
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900">
          Пользователи
        </h1>
        <p class="mt-1 text-sm text-muted-color">
          Список пользователей текущего тенанта.
        </p>
      </div>
      <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
    </header>

    <div class="flex flex-wrap items-center gap-3">
      <IconField class="w-full min-w-[16rem] max-w-md">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          placeholder="Поиск по email, имени или фамилии"
          class="w-full"
        />
      </IconField>

      <Select
        v-model="role"
        :options="[{ label: 'Все роли', value: '' }, ...roleOptionsRu]"
        option-label="label"
        option-value="value"
        class="w-52"
        placeholder="Роль"
      />
    </div>

    <DataTable
      :value="users"
      :loading="loading"
      data-key="id"
      class="mt-2"
      striped-rows
      :paginator="showUsersPaginator"
      lazy
      :total-records="total"
      :rows="pageSize"
      :rows-per-page-options="[10, 20, 50, 100]"
      :first="usersTableFirst"
      paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      current-page-report-template="{first}–{last} из {totalRecords}"
      @page="onUsersPage"
    >
      <template #empty>
        <div
          v-if="!loading"
          class="flex flex-col items-center justify-center gap-2 py-12 text-muted-color"
        >
          <i class="pi pi-users text-4xl opacity-40" aria-hidden="true" />
          <span class="text-sm font-medium text-surface-700">Нет пользователей</span>
          <span class="text-xs text-center max-w-sm">
            Измените фильтры или добавьте пользователя кнопкой «Создать».
          </span>
        </div>
      </template>
      <Column
        header="№"
        style="width: 3.25rem"
        header-class="!text-center"
        body-class="text-center text-muted-color tabular-nums"
      >
        <template #body="{ index }">
          {{ usersTableFirst + index + 1 }}
        </template>
      </Column>
      <Column header="Игрок" style="min-width: 12rem">
        <template #body="{ data }">
          <span class="font-medium text-surface-900 truncate min-w-0 block">
            {{ data.name }}
            <template v-if="(data.lastName ?? '').trim()">
              {{ ' ' }}{{ data.lastName }}
            </template>
          </span>
        </template>
      </Column>
      <Column field="email" header="Email" />
      <Column header="Роль" style="min-width: 10rem">
        <template #body="{ data }">
          {{ userRoleLabelRu(data.role) }}
        </template>
      </Column>
      <Column field="createdAt" header="Создан">
        <template #body="{ data }">
          {{ new Date(data.createdAt).toLocaleDateString() }}
        </template>
      </Column>
      <Column
        header="Действия"
        style="width: 6.75rem; min-width: 6.75rem"
        header-class="!text-end"
        body-class="!text-end"
      >
        <template #body="{ data }">
          <div class="inline-flex flex-nowrap items-center justify-end gap-0 shrink-0">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              severity="secondary"
              class="!shrink-0 !p-1"
              size="small"
              aria-label="Редактировать"
              @click="openEdit(data)"
            />
            <Button
              :icon="data.blocked ? 'pi pi-lock-open' : 'pi pi-lock'"
              text
              rounded
              :severity="data.blocked ? 'warn' : 'secondary'"
              class="!shrink-0 !p-1"
              size="small"
              :aria-label="data.blocked ? 'Разблокировать' : 'Заблокировать'"
              @click="toggleBlock(data)"
            />
            <Button
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              class="!shrink-0 !p-1"
              size="small"
              aria-label="Удалить"
              @click="deleteUser(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="showForm"
      modal
      :header="isEdit ? 'Редактировать пользователя' : 'Создать пользователя'"
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1">Email</label>
          <InputText v-model="form.email" class="w-full" :disabled="isEdit" />
        </div>
        <div>
          <label class="text-sm block mb-1">Имя</label>
          <InputText v-model="form.name" class="w-full" />
        </div>
        <div>
          <label class="text-sm block mb-1">Фамилия</label>
          <InputText v-model="form.lastName" class="w-full" placeholder="Необязательно" />
        </div>
        <div>
          <label class="text-sm block mb-1">
            {{ isEdit ? 'Новый пароль (опционально)' : 'Пароль' }}
          </label>
          <Password
            v-model="form.password"
            input-class="w-full"
            toggleMask
            :feedback="false"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Роль</label>
          <Select
            v-model="form.role"
            :options="roleOptionsRu"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <div class="flex justify-end gap-2 mt-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button
            :label="isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            @click="saveUser"
          />
        </div>
      </div>
    </Dialog>
  </section>
</template>


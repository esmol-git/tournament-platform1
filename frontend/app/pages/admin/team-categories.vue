<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TeamCategoryRow } from '~/types/admin/team-category'

definePageMeta({ layout: 'admin' })

const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()

const tenantId = useTenantId()

const loading = ref(false)
const saving = ref(false)
const categories = ref<TeamCategoryRow[]>([])
const showForm = ref(false)
const editing = ref<TeamCategoryRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
})

const fetchCategories = async () => {
  if (!token.value) return
  loading.value = true
  try {
    categories.value = await authFetch<TeamCategoryRow[]>(
      apiUrl(`/tenants/${tenantId.value}/team-categories`),
      {
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editing.value = null
  form.name = ''
  showForm.value = true
}

const openEdit = (c: TeamCategoryRow) => {
  editing.value = c
  form.name = c.name
  showForm.value = true
}

const saveCategory = async () => {
  if (!token.value) return
  saving.value = true
  try {
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { name: form.name || undefined },
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { name: form.name },
      })
    }
    showForm.value = false
    await fetchCategories()
  } finally {
    saving.value = false
  }
}

const deleteCategory = async (c: TeamCategoryRow) => {
  if (!token.value) return
  if (!confirm(`Удалить категорию "${c.name}"?`)) return
  await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${c.id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token.value}` },
  })
  await fetchCategories()
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  fetchCategories()
})
</script>

<template>
  <section class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-surface-900">Категории команд</h1>
        <p class="mt-1 text-sm text-muted-color">Справочник категорий.</p>
      </div>
      <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
    </header>

    <DataTable :value="categories" :loading="loading" stripedRows>
      <Column field="name" header="Название" />
      <Column header="Действия" style="width: 12rem">
        <template #body="{ data }">
          <div class="flex gap-2 justify-end w-full">
            <Button icon="pi pi-pencil" text size="small" @click="openEdit(data)" aria-label="Редактировать" />
            <Button
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="deleteCategory(data)"
              aria-label="Удалить"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="showForm"
      @update:visible="(v) => (showForm = v)"
      modal
      :header="isEdit ? 'Редактировать категорию' : 'Создать категорию'"
      :style="{ width: '34rem' }"
      :contentStyle="{ paddingTop: '1.75rem' }"
    >
      <div class="space-y-4">
        <FloatLabel variant="on" class="block">
          <InputText id="cat_name" v-model="form.name" class="w-full" />
          <label for="cat_name">Название</label>
        </FloatLabel>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Отмена" text @click="showForm = false" />
          <Button :label="isEdit ? 'Сохранить' : 'Создать'" icon="pi pi-check" :loading="saving" @click="saveCategory" />
        </div>
      </template>
    </Dialog>
  </section>
</template>


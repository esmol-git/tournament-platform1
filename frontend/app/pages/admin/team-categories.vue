<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { TeamCategoryRow, TeamCategoryRule } from '~/types/admin/team-category'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({ layout: 'admin' })

const { token, user, syncWithStorage, loggedIn, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const router = useRouter()
const toast = useToast()

const tenantId = useTenantId()

const loading = ref(false)
const saving = ref(false)
const categories = ref<TeamCategoryRow[]>([])
const rows = ref(10)
const first = ref(0)
const showPaginator = computed(() => categories.value.length > 10)
const showForm = ref(false)
const editing = ref<TeamCategoryRow | null>(null)
const isEdit = computed(() => !!editing.value)

const form = reactive({
  name: '',
  rules: [] as Array<{
    localId: string
    type: 'AGE' | 'GENDER'
    minBirthYear: number | null
    maxBirthYear: number | null
    requireBirthDate: boolean
    allowedGenders: Array<'MALE' | 'FEMALE'>
  }>,
})

const typeOptions = [
  { label: 'Возраст', value: 'AGE' as const },
  { label: 'Пол', value: 'GENDER' as const },
]

const genderOptions = [
  { label: 'Мужской', value: 'MALE' as const },
  { label: 'Женский', value: 'FEMALE' as const },
]

const newRule = (src?: Partial<TeamCategoryRule>) => ({
  localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  type: (src?.type ?? 'AGE') as 'AGE' | 'GENDER',
  minBirthYear: src?.minBirthYear ?? null,
  maxBirthYear: src?.maxBirthYear ?? null,
  requireBirthDate: src?.requireBirthDate ?? false,
  allowedGenders: [...(src?.allowedGenders ?? [])] as Array<'MALE' | 'FEMALE'>,
})

const addRule = () => {
  const hasAgeRule = form.rules.some((r) => r.type === 'AGE')
  form.rules.push(newRule({ type: hasAgeRule ? 'GENDER' : 'AGE' }))
}

const removeRule = (localId: string) => {
  form.rules = form.rules.filter((r) => r.localId !== localId)
}

const effectiveRulesHint = computed(() => {
  const ageRules = form.rules.filter((r) => r.type === 'AGE')
  const genderRules = form.rules.filter((r) => r.type === 'GENDER')

  const warnings: string[] = []
  const info: string[] = []

  if (ageRules.length > 1) {
    warnings.push(
      'Несколько возрастных правил работают одновременно (логическое И). Обычно достаточно одного правила возраста.',
    )
  }
  if (genderRules.length > 1) {
    warnings.push(
      'Несколько правил пола пересекаются между собой. Если пересечение пустое, сохранить не получится.',
    )
  }

  const minBirthYears = ageRules
    .map((r) => r.minBirthYear)
    .filter((v): v is number => typeof v === 'number')
  const maxBirthYears = ageRules
    .map((r) => r.maxBirthYear)
    .filter((v): v is number => typeof v === 'number')

  const effectiveMin = minBirthYears.length ? Math.max(...minBirthYears) : null
  const effectiveMax = maxBirthYears.length ? Math.min(...maxBirthYears) : null
  const requireBirthDate = ageRules.some((r) => r.requireBirthDate)

  if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) {
    warnings.push(
      `Конфликт по возрасту: итоговый диапазон невозможен (мин. ${effectiveMin} > макс. ${effectiveMax}).`,
    )
  } else if (effectiveMin != null || effectiveMax != null) {
    info.push(
      `Итог по возрасту: ${effectiveMin != null ? `от ${effectiveMin}` : 'без нижней границы'}${effectiveMax != null ? `, до ${effectiveMax}` : ''}.`,
    )
  } else {
    info.push('Итог по возрасту: без ограничений.')
  }

  info.push(
    `Дата рождения: ${requireBirthDate ? 'обязательна' : 'не обязательна'} (если в любом возрастном правиле включена обязательность, она применяется ко всей категории).`,
  )

  const allowedGenderSets = genderRules
    .map((r) => new Set(r.allowedGenders))
    .filter((set) => set.size > 0)

  if (!allowedGenderSets.length) {
    info.push('Итог по полу: любой.')
  } else {
    let intersection = new Set(['MALE', 'FEMALE'])
    for (const set of allowedGenderSets) {
      intersection = new Set([...intersection].filter((g) => set.has(g as 'MALE' | 'FEMALE')))
    }
    if (!intersection.size) {
      warnings.push('Конфликт по полу: пересечение правил пустое (ни один пол не подходит).')
    } else {
      const labels = [...intersection].map((g) => (g === 'MALE' ? 'мужской' : 'женский'))
      info.push(`Итог по полу: ${labels.join(', ')}.`)
    }
  }

  return { warnings, info }
})

const ageRulesCount = computed(() => form.rules.filter((r) => r.type === 'AGE').length)

const typeOptionsForRule = (localId: string) =>
  typeOptions.map((option) => {
    if (option.value !== 'AGE') return option
    const current = form.rules.find((r) => r.localId === localId)
    const anotherAgeExists =
      ageRulesCount.value > 0 &&
      (!current || current.type !== 'AGE' || ageRulesCount.value > 1)
    return { ...option, disabled: anotherAgeExists }
  })

const constraintsSummary = (c: TeamCategoryRow) => {
  if (!c.rules?.length) return 'Без ограничений'
  const parts = c.rules.map((r) => {
    if (r.type === 'GENDER') {
      const genders = r.allowedGenders.map((g) => (g === 'MALE' ? 'муж.' : 'жен.')).join(', ')
      return genders ? `Пол: ${genders}` : 'Пол: любой'
    }
    const ageParts: string[] = []
    if (r.minBirthYear != null) ageParts.push(`от ${r.minBirthYear}`)
    if (r.maxBirthYear != null) ageParts.push(`до ${r.maxBirthYear}`)
    if (r.requireBirthDate) ageParts.push('дата обязательна')
    return `Возраст ${ageParts.join(', ') || 'без границ'}`
  })
  return parts.join(' | ')
}

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

const onPage = (event: { first: number; rows: number }) => {
  first.value = event.first
  rows.value = event.rows
}

const openCreate = () => {
  editing.value = null
  form.name = ''
  form.rules = [newRule()]
  showForm.value = true
}

const openEdit = (c: TeamCategoryRow) => {
  editing.value = c
  form.name = c.name
  form.rules = (c.rules?.length ? c.rules : [{ type: 'AGE' }]).map((r) => newRule(r))
  showForm.value = true
}

const saveCategory = async () => {
  if (!token.value) return
  if (ageRulesCount.value > 1) {
    toast.add({
      severity: 'warn',
      summary: 'Слишком много возрастных правил',
      detail: 'Для одной категории разрешено только одно правило типа "Возраст".',
      life: 4500,
    })
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${editing.value!.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          name: form.name || undefined,
          rules: form.rules.map((r) => ({
            type: r.type,
            minBirthYear: r.type === 'AGE' ? r.minBirthYear ?? null : null,
            maxBirthYear: r.type === 'AGE' ? r.maxBirthYear ?? null : null,
            requireBirthDate: r.type === 'AGE' ? r.requireBirthDate : false,
            allowedGenders: r.type === 'GENDER' ? r.allowedGenders : [],
          })),
        },
      })
    } else {
      await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: {
          name: form.name,
          rules: form.rules.map((r) => ({
            type: r.type,
            minBirthYear: r.type === 'AGE' ? r.minBirthYear ?? undefined : undefined,
            maxBirthYear: r.type === 'AGE' ? r.maxBirthYear ?? undefined : undefined,
            requireBirthDate: r.type === 'AGE' ? r.requireBirthDate : false,
            allowedGenders: r.type === 'GENDER' ? r.allowedGenders : [],
          })),
        },
      })
    }
    showForm.value = false
    first.value = 0
    await fetchCategories()
    toast.add({
      severity: 'success',
      summary: isEdit.value ? 'Категория обновлена' : 'Категория создана',
      life: 2500,
    })
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: isEdit.value ? 'Не удалось сохранить категорию' : 'Не удалось создать категорию',
      detail: getApiErrorMessage(error, 'Проверьте ограничения и попробуйте снова.'),
      life: 7000,
    })
  } finally {
    saving.value = false
  }
}

const deleteCategoryConfirmOpen = ref(false)
const categoryToDelete = ref<TeamCategoryRow | null>(null)
const deleteCategoryMessage = computed(() => {
  const c = categoryToDelete.value
  if (!c) return ''
  return `Удалить категорию «${c.name}»? Команды с этой категорией нужно будет перевести в другую.`
})

function requestDeleteCategory(c: TeamCategoryRow) {
  categoryToDelete.value = c
  deleteCategoryConfirmOpen.value = true
}

async function confirmDeleteCategory() {
  const c = categoryToDelete.value
  if (!token.value || !c) return
  try {
    await authFetch(apiUrl(`/tenants/${tenantId.value}/team-categories/${c.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    first.value = 0
    await fetchCategories()
    toast.add({ severity: 'success', summary: 'Категория удалена', life: 2500 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить категорию',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    categoryToDelete.value = null
  }
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
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-0">Категории</h1>
        <p class="mt-1 text-sm text-muted-color">Категории команд — для фильтров и форм.</p>
      </div>
      <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
    </header>

    <DataTable
      :value="categories"
      :loading="loading"
      stripedRows
      :paginator="showPaginator"
      :rows="rows"
      :first="first"
      :totalRecords="categories.length"
      :rowsPerPageOptions="[5, 10, 20, 50]"
      paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
      currentPageReportTemplate="{first}-{last} из {totalRecords}"
      @page="onPage"
    >
      <Column field="name" header="Название" />
      <Column header="Тип"><template #body>Составные</template></Column>
      <Column header="Ограничения">
        <template #body="{ data }">
          <span class="text-sm text-muted-color">
            {{ constraintsSummary(data) }}
          </span>
        </template>
      </Column>
      <Column header="Действия" style="width: 12rem">
        <template #body="{ data }">
          <div class="flex gap-2 justify-end w-full">
            <Button icon="pi pi-pencil" text size="small" @click="openEdit(data)" aria-label="Редактировать" />
            <Button
              icon="pi pi-trash"
              text
              severity="danger"
              size="small"
              @click="requestDeleteCategory(data)"
              aria-label="Удалить"
            />
          </div>
        </template>
      </Column>
      <template #empty>
        <div class="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <i class="pi pi-tags text-3xl text-muted-color" aria-hidden="true" />
          <div class="space-y-1">
            <p class="text-sm font-medium text-surface-900 dark:text-surface-0">Категорий пока нет</p>
            <p class="text-sm text-muted-color">
              Создай первую категорию, чтобы использовать ее в командах и турнирах.
            </p>
          </div>
          <Button label="Создать категорию" icon="pi pi-plus" size="small" @click="openCreate" />
        </div>
      </template>
    </DataTable>

    <AdminConfirmDialog
      v-model="deleteCategoryConfirmOpen"
      title="Удалить категорию?"
      :message="deleteCategoryMessage"
      @confirm="confirmDeleteCategory"
    />

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

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">Правила категории</p>
            <Button size="small" text icon="pi pi-plus" label="Добавить правило" @click="addRule" />
          </div>

          <div class="rounded-lg border border-surface-200 p-3 text-sm dark:border-surface-700">
            <p class="font-medium text-surface-900 dark:text-surface-0">Как будут применяться правила</p>
            <ul class="mt-2 space-y-1 text-muted-color">
              <li v-for="(line, idx) in effectiveRulesHint.info" :key="`info-${idx}`">- {{ line }}</li>
            </ul>
            <ul
              v-if="effectiveRulesHint.warnings.length"
              class="mt-3 space-y-1 text-orange-600 dark:text-orange-400"
            >
              <li v-for="(line, idx) in effectiveRulesHint.warnings" :key="`warn-${idx}`">- {{ line }}</li>
            </ul>
          </div>

          <div
            v-for="(rule, idx) in form.rules"
            :key="rule.localId"
            class="rounded-lg border border-surface-200 p-3 space-y-3 dark:border-surface-700"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-color">Правило #{{ idx + 1 }}</span>
              <Button
                size="small"
                text
                severity="danger"
                icon="pi pi-trash"
                :disabled="form.rules.length === 1"
                @click="removeRule(rule.localId)"
              />
            </div>

            <FloatLabel variant="on" class="block">
              <Select
                :inputId="`cat_rule_type_${rule.localId}`"
                v-model="rule.type"
                :options="typeOptionsForRule(rule.localId)"
                option-label="label"
                option-value="value"
                option-disabled="disabled"
                class="w-full"
              />
              <label :for="`cat_rule_type_${rule.localId}`">Тип ограничения</label>
            </FloatLabel>

            <template v-if="rule.type === 'AGE'">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FloatLabel variant="on" class="block">
                  <InputNumber :inputId="`cat_min_birth_year_${rule.localId}`" v-model="rule.minBirthYear" class="w-full" :useGrouping="false" />
                  <label :for="`cat_min_birth_year_${rule.localId}`">Мин. год рождения</label>
                </FloatLabel>
                <FloatLabel variant="on" class="block">
                  <InputNumber :inputId="`cat_max_birth_year_${rule.localId}`" v-model="rule.maxBirthYear" class="w-full" :useGrouping="false" />
                  <label :for="`cat_max_birth_year_${rule.localId}`">Макс. год рождения</label>
                </FloatLabel>
              </div>
              <label :for="`cat_require_birth_date_${rule.localId}`" class="inline-flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox :inputId="`cat_require_birth_date_${rule.localId}`" v-model="rule.requireBirthDate" binary />
                <span>Дата рождения обязательна</span>
              </label>
            </template>

            <template v-else>
              <FloatLabel variant="on" class="block">
                <MultiSelect
                  :inputId="`cat_allowed_genders_${rule.localId}`"
                  v-model="rule.allowedGenders"
                  :options="genderOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  placeholder="Любой пол"
                  :maxSelectedLabels="2"
                />
                <label :for="`cat_allowed_genders_${rule.localId}`">Разрешенный пол</label>
              </FloatLabel>
            </template>
          </div>
        </div>
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


import type { ComputedRef, Ref } from 'vue'
import { ref } from 'vue'
import type { AuthFetchFn } from '~/composables/useLazyPaginatedTeamsSelect'
import { getApiErrorMessage } from '~/utils/apiError'

const MAX_BYTES = 15 * 1024 * 1024

export interface AdminToastLike {
  add: (msg: {
    severity: string
    summary: string
    detail?: string
    life?: number
  }) => void
}

/** Загрузка / сброс логотипа команды (форма админки команд). */
export function useTenantTeamLogo(opts: {
  form: { logoUrl: string }
  isEdit: ComputedRef<boolean>
  editingTeamId: () => string | null
  tenantId: Ref<string>
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  toast: AdminToastLike
  onAfterPersist: () => Promise<void>
}) {
  const logoFileInput = ref<HTMLInputElement | null>(null)
  const logoUploading = ref(false)
  const logoRemoving = ref(false)

  const triggerLogoPick = () => {
    if (logoUploading.value || logoRemoving.value) return
    logoFileInput.value?.click()
  }

  const onLogoFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) return

    if (file.size > MAX_BYTES) {
      opts.toast.add({
        severity: 'warn',
        summary: 'Файл слишком большой',
        detail: 'Максимум 15 МБ.',
        life: 4000,
      })
      if (target) target.value = ''
      return
    }

    logoUploading.value = true
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await opts.authFetch<{ key: string; url: string }>(opts.apiUrl('/upload?folder=teams'), {
        method: 'POST',
        body,
      })
      const imageUrl = res.url
      opts.form.logoUrl = imageUrl

      const teamId = opts.editingTeamId()
      if (opts.isEdit.value && teamId && opts.token.value) {
        try {
          await opts.authFetch(opts.apiUrl(`/tenants/${opts.tenantId.value}/teams/${teamId}`), {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${opts.token.value}` },
            body: { logoUrl: imageUrl },
          })
          await opts.onAfterPersist()
          opts.toast.add({
            severity: 'success',
            summary: 'Логотип загружен и сохранён',
            life: 3000,
          })
        } catch (patchErr: unknown) {
          opts.toast.add({
            severity: 'warn',
            summary: 'Файл загружен, но ссылка не записана в команду',
            detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
            life: 7000,
          })
        }
      } else {
        opts.toast.add({
          severity: 'success',
          summary: 'Логотип загружен',
          detail: 'Нажми «Создать», чтобы сохранить команду.',
          life: 4000,
        })
      }
    } catch (err: unknown) {
      opts.toast.add({
        severity: 'error',
        summary: 'Не удалось загрузить',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      logoUploading.value = false
      if (target) target.value = ''
    }
  }

  const removeTeamLogo = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!opts.form.logoUrl || logoUploading.value || logoRemoving.value) return

    opts.form.logoUrl = ''

    const teamId = opts.editingTeamId()
    if (opts.isEdit.value && teamId && opts.token.value) {
      logoRemoving.value = true
      try {
        await opts.authFetch(opts.apiUrl(`/tenants/${opts.tenantId.value}/teams/${teamId}`), {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${opts.token.value}` },
          body: { logoUrl: null },
        })
        await opts.onAfterPersist()
        opts.toast.add({
          severity: 'success',
          summary: 'Логотип удалён',
          life: 2500,
        })
      } catch (err: unknown) {
        opts.toast.add({
          severity: 'error',
          summary: 'Не удалось убрать логотип',
          detail: getApiErrorMessage(err),
          life: 6000,
        })
      } finally {
        logoRemoving.value = false
      }
    }
  }

  return {
    logoFileInput,
    logoUploading,
    logoRemoving,
    triggerLogoPick,
    onLogoFileChange,
    removeTeamLogo,
  }
}

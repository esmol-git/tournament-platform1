<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import { usePlayoffSlotLabels } from '~/composables/usePlayoffSlotLabels'
import type { MatchEventRow, MatchRow, TournamentDetails } from '~/types/tournament-admin'
import type { TeamPlayerRow } from '~/types/admin/team'
import { getApiErrorMessage } from '~/utils/apiError'
import { mergeDateAndTime, splitStartTimeToDateAndTime } from '~/utils/matchDateTimeFields'
import {
  eventTypeOptions,
  isMatchEditLocked,
  statusOptions,
  teamSideOptions,
} from '~/utils/tournamentAdminUi'
import { computed, reactive, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Режим матчей без турнира — PATCH на /tenants/.../standalone-matches/... */
    standalone?: boolean
    tournamentId?: string | null
    tournament: TournamentDetails | null
    match: MatchRow | null
  }>(),
  {
    standalone: false,
    tournamentId: null,
  },
)

const visible = defineModel<boolean>('visible', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const { token, user, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()

const tournamentRef = computed(() => props.tournament)
const { playoffSlotLabels } = usePlayoffSlotLabels(tournamentRef)

const canOverrideLockedProtocol = computed(
  () => user.value?.role === 'TENANT_ADMIN',
)
const protocolLocked = computed(
  () =>
    !!props.match &&
    isMatchEditLocked(props.match.status) &&
    !canOverrideLockedProtocol.value,
)

const protocolSaving = ref(false)
const protocolPlayersLoading = ref(false)
const protocolHomePlayers = ref<TeamPlayerRow[]>([])
const protocolAwayPlayers = ref<TeamPlayerRow[]>([])

const protocolHomePlayerOptions = computed(() =>
  protocolHomePlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)
const protocolAwayPlayerOptions = computed(() =>
  protocolAwayPlayers.value.map((tp) => ({
    label: `${tp.player.lastName} ${tp.player.firstName}`,
    value: tp.playerId,
  })),
)

const protocolDate = ref<Date | null>(null)
const protocolTime = ref<Date | null>(null)

const protocolForm = reactive({
  startTime: null as Date | null,
  homeScore: 0,
  awayScore: 0,
  extraTimeHomeScore: null as number | null,
  extraTimeAwayScore: null as number | null,
  penaltiesHomeScore: null as number | null,
  penaltiesAwayScore: null as number | null,
  status: 'PLAYED',
  events: [] as {
    type: string
    minute: number | null
    playerId: string
    teamSide: 'HOME' | 'AWAY' | null
    payload?: Record<string, unknown>
  }[],
})

const isPlayoffMatch = computed(() => props.match?.stage === 'PLAYOFF')
const showExtraTimeFields = ref(false)
const showPenaltyFields = ref(false)

const EXTRA_TIME_META = 'EXTRA_TIME_SCORE'
const PENALTIES_META = 'PENALTY_SCORE'

const loadPlayers = async (m: MatchRow) => {
  protocolPlayersLoading.value = true
  try {
    const [home, away] = await Promise.all([
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.homeTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
      authFetch<{ items: TeamPlayerRow[]; total: number }>(
        apiUrl(`/tenants/${tenantId.value}/teams/${m.awayTeam.id}/players`),
        {
          headers: { Authorization: `Bearer ${token.value}` },
          params: { page: 1, pageSize: 200 },
        },
      ),
    ])
    protocolHomePlayers.value = home.items
    protocolAwayPlayers.value = away.items
  } catch {
    protocolHomePlayers.value = []
    protocolAwayPlayers.value = []
  } finally {
    protocolPlayersLoading.value = false
  }
}

watch(
  () => [visible.value, props.match] as const,
  async ([open, m]) => {
    if (!open || !m) return
    protocolForm.startTime = m.startTime ? new Date(m.startTime) : null
    const sp = splitStartTimeToDateAndTime(protocolForm.startTime)
    protocolDate.value = sp.date
    protocolTime.value = sp.time
    protocolForm.homeScore = (m.homeScore ?? 0) as number
    protocolForm.awayScore = (m.awayScore ?? 0) as number
    protocolForm.status = (m.status ?? 'PLAYED') as string
    protocolForm.extraTimeHomeScore = null
    protocolForm.extraTimeAwayScore = null
    protocolForm.penaltiesHomeScore = null
    protocolForm.penaltiesAwayScore = null
    showExtraTimeFields.value = false
    showPenaltyFields.value = false
    protocolForm.events = []

    for (const e of (m.events ?? []) as MatchEventRow[]) {
      const payload = (e as { payload?: Record<string, unknown> }).payload
      const metaType = typeof payload?.metaType === 'string' ? payload.metaType : null
      if (metaType === EXTRA_TIME_META) {
        protocolForm.extraTimeHomeScore =
          typeof payload.homeScore === 'number' ? payload.homeScore : null
        protocolForm.extraTimeAwayScore =
          typeof payload.awayScore === 'number' ? payload.awayScore : null
        showExtraTimeFields.value = true
        continue
      }
      if (metaType === PENALTIES_META) {
        protocolForm.penaltiesHomeScore =
          typeof payload.homeScore === 'number' ? payload.homeScore : null
        protocolForm.penaltiesAwayScore =
          typeof payload.awayScore === 'number' ? payload.awayScore : null
        showPenaltyFields.value = true
        continue
      }

      protocolForm.events.push({
        type: e.type,
        minute: (e.minute ?? null) as number | null,
        playerId: (e.playerId ?? '') as string,
        teamSide: (e.teamSide ?? null) as 'HOME' | 'AWAY' | null,
        payload: payload ?? undefined,
      })
    }
    await loadPlayers(m)
  },
)

watch([protocolDate, protocolTime], () => {
  protocolForm.startTime = mergeDateAndTime(protocolDate.value, protocolTime.value)
})

const addEvent = () => {
  protocolForm.events.push({
    type: 'GOAL',
    minute: null,
    playerId: '',
    teamSide: 'HOME',
  })
}

const removeEvent = (idx: number) => {
  protocolForm.events.splice(idx, 1)
}

const saveProtocol = async () => {
  if (!token.value || !props.match) return
  if (protocolLocked.value) {
    toast.add({
      severity: 'info',
      summary: 'Матч завершён',
      detail: 'Протокол нельзя изменить.',
      life: 4000,
    })
    return
  }
  protocolSaving.value = true
  try {
    const desiredStartTime = protocolForm.startTime instanceof Date ? protocolForm.startTime : null
    const currentStartTime = props.match.startTime ? new Date(props.match.startTime) : null
    const timeChanged =
      desiredStartTime &&
      (!currentStartTime || desiredStartTime.getTime() !== currentStartTime.getTime())

    if (timeChanged) {
      if (props.standalone) {
        await authFetch(
          apiUrl(`/tenants/${tenantId.value}/standalone-matches/${props.match.id}`),
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { startTime: desiredStartTime!.toISOString() },
          },
        )
      } else if (props.tournamentId) {
        await authFetch(
          apiUrl(`/tournaments/${props.tournamentId}/matches/${props.match.id}`),
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { startTime: desiredStartTime!.toISOString() },
          },
        )
      }
    }

    const protocolUrl = props.standalone
      ? apiUrl(`/tenants/${tenantId.value}/standalone-matches/${props.match.id}/protocol`)
      : apiUrl(`/tournaments/${props.tournamentId}/matches/${props.match.id}/protocol`)

    const eventsPayload = protocolForm.events.map((e) => ({
      type: e.type,
      minute: e.minute ?? undefined,
      playerId: e.playerId || undefined,
      teamSide: e.teamSide ?? undefined,
      payload: e.payload,
    }))

    if (isPlayoffMatch.value) {
      if (
        protocolForm.extraTimeHomeScore !== null &&
        protocolForm.extraTimeAwayScore !== null
      ) {
        eventsPayload.push({
          type: 'CUSTOM',
          minute: undefined,
          playerId: undefined,
          teamSide: undefined,
          payload: {
            metaType: EXTRA_TIME_META,
            homeScore: protocolForm.extraTimeHomeScore,
            awayScore: protocolForm.extraTimeAwayScore,
          },
        })
      }
      if (
        protocolForm.penaltiesHomeScore !== null &&
        protocolForm.penaltiesAwayScore !== null
      ) {
        eventsPayload.push({
          type: 'CUSTOM',
          minute: undefined,
          playerId: undefined,
          teamSide: undefined,
          payload: {
            metaType: PENALTIES_META,
            homeScore: protocolForm.penaltiesHomeScore,
            awayScore: protocolForm.penaltiesAwayScore,
          },
        })
      }
    }

    await authFetch(protocolUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: {
        homeScore: protocolForm.homeScore,
        awayScore: protocolForm.awayScore,
        status: protocolForm.status,
        events: eventsPayload,
      },
    })
    visible.value = false
    emit('saved')
    toast.add({
      severity: 'success',
      summary: 'Протокол сохранён',
      detail: props.standalone
        ? 'Результат матча сохранён.'
        : 'Результат матча обновлён, таблица пересчитана.',
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить протокол',
      detail: getApiErrorMessage(e, 'Ошибка запроса'),
      life: 6000,
    })
  } finally {
    protocolSaving.value = false
  }
}

const finishProtocol = async () => {
  if (protocolLocked.value) return
  if (protocolForm.status !== 'FINISHED') protocolForm.status = 'FINISHED'
  await saveProtocol()
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => (visible = v)"
    modal
    :header="protocolLocked ? 'Протокол матча (только просмотр)' : 'Протокол матча'"
    :style="{ width: '36rem' }"
  >
    <div v-if="match" class="space-y-4">
      <p
        v-if="protocolLocked"
        class="text-sm text-muted-color rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 px-3 py-2"
      >
        Завершённый матч нельзя редактировать.
      </p>
      <p
        v-else-if="match && isMatchEditLocked(match.status) && canOverrideLockedProtocol"
        class="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2"
      >
        Экстренный режим: администратор арендатора может изменить протокол завершённого матча.
      </p>
      <div class="text-sm">
        <span class="font-medium">
          {{ playoffSlotLabels(match)?.home ?? match.homeTeam.name }}
        </span>
        <span class="text-muted-color mx-1">
          {{ playoffSlotLabels(match) ? '-' : 'vs' }}
        </span>
        <span class="font-medium">
          {{ playoffSlotLabels(match)?.away ?? match.awayTeam.name }}
        </span>
        <span class="text-muted-color">
          · {{ new Date(match.startTime).toLocaleDateString() }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Счёт (хозяева)</label>
          <InputNumber
            v-model="protocolForm.homeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Счёт (гости)</label>
          <InputNumber
            v-model="protocolForm.awayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div v-if="isPlayoffMatch" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">Дополнительное время</label>
          <Button
            v-if="!showExtraTimeFields"
            label="Добавить"
            icon="pi pi-plus"
            text
            size="small"
            :disabled="protocolLocked"
            @click="showExtraTimeFields = true"
          />
          <Button
            v-else
            label="Скрыть"
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :disabled="protocolLocked"
            @click="
              showExtraTimeFields = false;
              protocolForm.extraTimeHomeScore = null;
              protocolForm.extraTimeAwayScore = null
            "
          />
        </div>
      </div>
      <div v-if="isPlayoffMatch && showExtraTimeFields" class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Доп. время (хозяева)</label>
          <InputNumber
            v-model="protocolForm.extraTimeHomeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Доп. время (гости)</label>
          <InputNumber
            v-model="protocolForm.extraTimeAwayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div v-if="isPlayoffMatch" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">Серия пенальти</label>
          <Button
            v-if="!showPenaltyFields"
            label="Добавить"
            icon="pi pi-plus"
            text
            size="small"
            :disabled="protocolLocked"
            @click="showPenaltyFields = true"
          />
          <Button
            v-else
            label="Скрыть"
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :disabled="protocolLocked"
            @click="
              showPenaltyFields = false;
              protocolForm.penaltiesHomeScore = null;
              protocolForm.penaltiesAwayScore = null
            "
          />
        </div>
      </div>
      <div v-if="isPlayoffMatch && showPenaltyFields" class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Пенальти (хозяева)</label>
          <InputNumber
            v-model="protocolForm.penaltiesHomeScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Пенальти (гости)</label>
          <InputNumber
            v-model="protocolForm.penaltiesAwayScore"
            class="w-full"
            :min="0"
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm block mb-1">Дата матча</label>
          <DatePicker
            v-model="protocolDate"
            class="w-full"
            dateFormat="dd.mm.yy"
            showIcon
            :disabled="protocolLocked"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Время матча</label>
          <DatePicker
            v-model="protocolTime"
            class="w-full"
            timeOnly
            hourFormat="24"
            showIcon
            :disabled="protocolLocked"
          />
        </div>
      </div>

      <div>
        <label class="text-sm block mb-1">Статус</label>
        <Select
          v-model="protocolForm.status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          :disabled="protocolLocked"
        />
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium">События</label>
          <Button
            label="Добавить"
            icon="pi pi-plus"
            text
            size="small"
            :disabled="protocolLocked"
            @click="addEvent"
          />
        </div>

        <div v-if="!protocolForm.events.length" class="mt-2 text-sm text-muted-color">
          Пока нет событий.
        </div>

        <div v-else class="mt-2 space-y-2">
          <div
            v-for="(e, idx) in protocolForm.events"
            :key="idx"
            class="rounded-lg border border-surface-200 dark:border-surface-700 p-3"
          >
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label class="text-xs block mb-1 text-muted-color">Тип</label>
                <Select
                  v-model="e.type"
                  :options="eventTypeOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :disabled="protocolLocked"
                />
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Команда</label>
                <Select
                  v-model="e.teamSide"
                  :options="teamSideOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  :disabled="protocolLocked"
                  @change="() => { e.playerId = '' }"
                />
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Минута</label>
                <InputNumber v-model="e.minute" class="w-full" :min="0" :disabled="protocolLocked" />
              </div>
              <div>
                <label class="text-xs block mb-1 text-muted-color">Игрок</label>
                <Select
                  v-model="e.playerId"
                  :options="e.teamSide === 'HOME' ? protocolHomePlayerOptions : e.teamSide === 'AWAY' ? protocolAwayPlayerOptions : []"
                  option-label="label"
                  option-value="value"
                  class="w-full"
                  placeholder="Выберите игрок"
                  :loading="protocolPlayersLoading"
                  :disabled="protocolLocked || protocolPlayersLoading || !e.teamSide"
                />
              </div>
            </div>
            <div class="mt-2 flex justify-end">
              <Button
                label="Удалить"
                icon="pi pi-trash"
                text
                severity="danger"
                size="small"
                :disabled="protocolLocked"
                @click="removeEvent(idx)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="Закрыть" text @click="visible = false" />
        <Button
          v-if="!protocolLocked"
          label="Сохранить"
          icon="pi pi-check"
          :loading="protocolSaving"
          @click="saveProtocol"
        />
        <Button
          v-if="!protocolLocked"
          label="Завершить"
          icon="pi pi-check-circle"
          severity="success"
          :loading="protocolSaving"
          :disabled="protocolForm.status === 'CANCELED' || protocolForm.status === 'FINISHED'"
          @click="finishProtocol"
        />
      </div>
    </template>
  </Dialog>
</template>

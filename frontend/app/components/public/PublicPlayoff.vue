<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MatchRow, TournamentDetails } from '~/types/tournament-admin'
import { formatMatchScoreDisplay, statusLabel } from '~/utils/tournamentAdminUi'
import { usePublicTournamentFetch } from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const props = defineProps<{
  tournamentId: string
}>()

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTournamentDetail } = usePublicTournamentFetch()

const loading = ref(false)
const errorText = ref('')
const matches = ref<MatchRow[]>([])

type PlayoffSection = {
  key: string
  title: string
  matches: MatchRow[]
  sortRank: number
}

function playoffRoundLabel(round?: string | null) {
  switch (round) {
    case 'FINAL':
      return 'Финал'
    case 'THIRD_PLACE':
      return 'Матч за 3 место'
    case 'SEMIFINAL':
      return 'Полуфинал'
    case 'QUARTERFINAL':
      return 'Четвертьфинал'
    default:
      return null
  }
}

function sectionTitleFor(matchesInSection: MatchRow[], roundNumber: number) {
  const explicit = matchesInSection[0]?.playoffRound ?? null
  const explicitLabel = playoffRoundLabel(explicit)
  if (explicit === 'FINAL' || explicit === 'THIRD_PLACE') return explicitLabel as string

  const byCount = matchesInSection.length
  if (byCount === 2) return 'Полуфинал'
  if (byCount === 4) return 'Четвертьфинал'
  if (byCount === 8) return '1/8 финала'
  return `Раунд ${roundNumber || 1}`
}

const playoffSections = computed<PlayoffSection[]>(() => {
  const playoffMatches = (matches.value ?? []).filter((m) => m.stage === 'PLAYOFF')
  const buckets = new Map<string, MatchRow[]>()

  for (const m of playoffMatches) {
    const roundNumber = m.roundNumber ?? 0
    const roundKey = m.playoffRound ?? `ROUND_${roundNumber}`
    const key = `${roundNumber}:${roundKey}`
    const arr = buckets.get(key) ?? []
    arr.push(m)
    buckets.set(key, arr)
  }

  const sections: PlayoffSection[] = []
  for (const [key, bucket] of buckets.entries()) {
    const [roundStr] = key.split(':')
    const roundNumber = Number(roundStr) || 0
    sections.push({
      key,
      title: sectionTitleFor(bucket, roundNumber),
      matches: bucket
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
      sortRank: roundNumber,
    })
  }

  return sections.sort((a, b) => a.sortRank - b.sortRank || a.key.localeCompare(b.key))
})

function formatDateTime(value?: string | null) {
  if (!value) return 'Дата не назначена'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return 'Дата не назначена'
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load() {
  errorText.value = ''
  matches.value = []
  if (!props.tournamentId) return

  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    return
  }
  loading.value = true
  try {
    const detail = await fetchTournamentDetail(tenant.value, props.tournamentId)
    matches.value = detail.matches ?? []
  } catch {
    errorText.value = 'Не удалось загрузить плей-офф.'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.tournamentId,
  () => {
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <div class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-sm font-semibold text-surface-900">Плей-офф</div>
        <div class="text-xs text-muted-color mt-1">
          Матчи на вылет вынесены отдельно от группового этапа.
        </div>
      </div>
    </div>

    <div v-if="errorText" class="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      {{ errorText }}
    </div>
    <div v-else-if="loading" class="mt-4 text-sm text-muted-color">
      Загрузка плей-офф...
    </div>
    <div
      v-else-if="!playoffSections.length"
      class="mt-4 rounded-xl border border-surface-200 bg-surface-0 p-5 text-muted-color text-center"
    >
      Сетка плей-офф пока не сформирована.
    </div>

    <div v-else class="mt-4 space-y-4">
      <section
        v-for="section in playoffSections"
        :key="section.key"
        class="rounded-xl border border-surface-200 overflow-hidden"
      >
        <header class="px-4 py-3 bg-surface-100 border-b border-surface-200">
          <h3 class="text-sm font-semibold text-surface-900">{{ section.title }}</h3>
        </header>
        <div class="divide-y divide-surface-200">
          <article
            v-for="m in section.matches"
            :key="m.id"
            class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center px-4 py-3"
          >
            <div class="font-medium text-surface-900 truncate">{{ m.homeTeam.name }}</div>
            <div class="text-sm font-semibold text-surface-900 text-center">
              {{ formatMatchScoreDisplay(m) }}
            </div>
            <div class="font-medium text-surface-900 truncate md:text-right">{{ m.awayTeam.name }}</div>
            <div class="text-xs text-muted-color md:pl-3">{{ formatDateTime(m.startTime) }}</div>
            <Tag :value="statusLabel(m.status)" severity="contrast" rounded />
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

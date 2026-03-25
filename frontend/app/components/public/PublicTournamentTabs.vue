<script setup lang="ts">
const props = defineProps<{
  modelValue: 'table' | 'chessboard' | 'progress' | 'playoff'
  capabilities?: {
    showTable?: boolean
    showChessboard?: boolean
    showProgress?: boolean
    showPlayoff?: boolean
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'table' | 'chessboard' | 'progress' | 'playoff'): void
}>()

function setView(v: 'table' | 'chessboard' | 'progress' | 'playoff') {
  emit('update:modelValue', v)
}
</script>

<template>
  <div class="flex items-center gap-2 rounded-xl bg-surface-200/30 p-1 border border-surface-200">
    <button
      v-if="props.capabilities?.showTable !== false"
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'table' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('table')"
    >
      ТАБЛИЦА
    </button>

    <button
      v-if="props.capabilities?.showChessboard !== false"
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'chessboard' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('chessboard')"
    >
      ШАХМАТКА
    </button>

    <button
      v-if="props.capabilities?.showProgress !== false"
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'progress' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('progress')"
    >
      ПРОГРЕСС
    </button>

    <button
      v-if="props.capabilities?.showPlayoff !== false"
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'playoff' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('playoff')"
    >
      ПЛЕЙ-ОФФ
    </button>
  </div>
</template>


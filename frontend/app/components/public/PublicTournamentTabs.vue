<script setup lang="ts">
const props = defineProps<{
  modelValue: 'table' | 'chessboard' | 'progress'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'table' | 'chessboard' | 'progress'): void
}>()

function setView(v: 'table' | 'chessboard' | 'progress') {
  emit('update:modelValue', v)
}
</script>

<template>
  <div class="flex items-center gap-2 rounded-xl bg-surface-200/30 p-1 border border-surface-200">
    <button
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'table' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('table')"
    >
      ТАБЛИЦА
    </button>

    <button
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'chessboard' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('chessboard')"
    >
      ШАХМАТКА
    </button>

    <button
      type="button"
      class="flex-1 text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="modelValue === 'progress' ? 'bg-primary/90 text-white' : 'text-surface-700 hover:bg-surface-0'"
      @click="setView('progress')"
    >
      ПРОГРЕСС
    </button>
  </div>
</template>


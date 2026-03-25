import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Синхронизация цветов Chart.js с классом `dark-mode` на корневом элементе (админская тема).
 */
export function useDashboardChartTheme() {
  const isDark = ref(
    import.meta.client
      ? document.documentElement.classList.contains('dark-mode')
      : false,
  )

  onMounted(() => {
    const sync = () => {
      isDark.value = document.documentElement.classList.contains('dark-mode')
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    onUnmounted(() => mo.disconnect())
  })

  return { isDark }
}

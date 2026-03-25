/** Минимальное время показа скелетона/лоадера, чтобы быстрый ответ API не давал мелькания. */
export const MIN_SKELETON_DISPLAY_MS = 1000

export async function sleepRemainingAfter(
  minMs: number,
  startedAt: number,
): Promise<void> {
  const elapsed = Date.now() - startedAt
  const remaining = minMs - elapsed
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining))
  }
}

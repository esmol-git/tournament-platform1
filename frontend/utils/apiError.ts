/**
 * Текст ошибки из ответа API ($fetch / ofetch) или общее сообщение.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  if (error == null) return fallback

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>
    const data = e.data
    if (data && typeof data === 'object') {
      const msg = (data as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.trim()) return msg
      if (Array.isArray(msg) && msg.length && typeof msg[0] === 'string') return msg.join(', ')
    }
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    if (typeof e.statusMessage === 'string' && e.statusMessage.trim()) return e.statusMessage
  }

  if (error instanceof Error && error.message.trim()) return error.message

  return fallback
}

/**
 * Список текстов ошибок из ответа API ($fetch / ofetch).
 * Нужен для показа нескольких валидационных ошибок по отдельности.
 */
export function getApiErrorMessages(error: unknown, fallback = 'Произошла ошибка'): string[] {
  if (error == null) return [fallback]

  if (typeof error === 'object') {
    const e = error as Record<string, unknown>
    const data = e.data
    if (data && typeof data === 'object') {
      const msg = (data as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.trim()) return [msg]
      if (Array.isArray(msg)) {
        const list = msg
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
        if (list.length) return list
      }
    }
    if (typeof e.message === 'string' && e.message.trim()) return [e.message]
    if (typeof e.statusMessage === 'string' && e.statusMessage.trim()) return [e.statusMessage]
  }

  if (error instanceof Error && error.message.trim()) return [error.message]
  return [fallback]
}

/** Разбить момент начала матча на дату (полночь локального дня) и время (опорная дата для time-only picker). */
export function splitStartTimeToDateAndTime(st: Date | null): {
  date: Date | null
  time: Date | null
} {
  if (!st) return { date: null, time: null }
  const d = new Date(st)
  return {
    date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    time: new Date(1970, 0, 1, d.getHours(), d.getMinutes(), 0, 0),
  }
}

/** Собрать `startTime` из полей «дата» и «время». Если время не задано — 12:00. */
export function mergeDateAndTime(date: Date | null, time: Date | null): Date | null {
  if (!date) return null
  const h = time ? time.getHours() : 12
  const m = time ? time.getMinutes() : 0
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0)
}

# Tournament Platform — Frontend

Nuxt 4 + Vue 3 + PrimeVue + Pinia.

## Требования

- Node.js 20+
- Запущенный backend API (по умолчанию порт **4000**)

## Переменные окружения

Скопируй `.env.example` в `.env` при необходимости:

| Переменная | Описание |
|------------|----------|
| `NUXT_PUBLIC_API_BASE` | Origin бэкенда **без** завершающего слэша, например `http://localhost:4000` |
| `NUXT_PUBLIC_DEFAULT_TENANT_SLUG` | Slug тенанта для логина, если пользователь не заходил с публичного `/{tenant}/…` (по умолчанию `default`) |

## Разработка

```bash
npm install
npm run dev
```

Приложение: [http://localhost:3000](http://localhost:3000).

## Сборка

```bash
npm run build
npm run preview
```

## Структура

- `app/pages/` — маршруты (в т.ч. `/admin`, `/[tenant]/…`)
- `composables/` — `useAuth` (обёртка над стором), `useApiUrl`
- `stores/` — Pinia: **`auth`** (сессия, `authFetch` / refresh), **`meta`** (роли), **`tenant`** (slug публичного сайта)
- `utils/apiError.ts` — `getApiErrorMessage()` для ответов API
- `types/tournament-admin.ts`, `utils/tournamentAdminUi.ts` — типы и подписи для страницы турнира

Подробнее: [документация Nuxt](https://nuxt.com/docs/getting-started/introduction).

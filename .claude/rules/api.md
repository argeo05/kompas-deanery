---
paths:
  - "src/app/api/**"
  - "src/server/**"
---

# Правила API (SPEC §9.3, C-22)

- Первая строка обработчика — `requireStudent(req)` или `requireStaff(req)` из `src/server/auth/guards.ts`.
- `userId`/`studentId` для роли student — только из сессии. Значения из пути, query и тела игнорируются.
- Чужой или несуществующий ресурс → `404 NOT_FOUND`, не 403.
- Вход — через Zod-схему из `src/server/schemas`; ответы — через `ok()`/`fail()` из `src/server/http.ts`.
- Доступ к БД — только через `src/server/repositories`, личные таблицы — внутри `withUserTx` и с условием по владельцу.
- Изменяющие запросы проверяют `Origin`; `POST`, создающий сущность, — через `withIdempotency`.
- Время — через `now()` из `src/lib/clock.ts`, пояс `Europe/Moscow`.
- Новый эндпоинт регистрируется в `tests/security/manifest.ts`.

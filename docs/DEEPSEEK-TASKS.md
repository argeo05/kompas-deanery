# Задачи для DeepSeek V4.1 Flash в OpenCode

Проект «Компас» — концепт личного кабинета студента для MGIMO AI Challenge (номинация «Вайб-кодинг»).
Спецификация продукта: `docs/SPEC.md` (ТЗ v1.1). Этот файл описывает **только** часть работы, которую выполняет дешёвая модель.

Версия 1.0 · 8 ноября 2026

---

## 0. Решение: в каком порядке работают модели

### Рекомендуемая схема — «сэндвич»: Claude → DeepSeek (параллельно с Claude) → Claude

| Фаза | Модель | Даты | Что делает | Почему так |
|---|---|---|---|---|
| **A. Фундамент** | Claude Opus 5.5 (Claude Code) | 9–11.11 | Каркас, схема БД и миграции, авторизация и роли, «стражи» доступа, контракты API (типы), **эталонный эндпоинт** с тестами, обвязка тестов безопасности, сид-фреймворк, заранее написанные юнит-тесты для чистой логики, дизайн-система | Дешёвая модель лучше всего работает, когда **копирует готовый образец** и проходит **готовые тесты**. Если начать с неё, архитектура «поплывёт», и Claude потратит больше токенов на переделку, чем сэкономили |
| **B. Бэкенд-тикеты** | DeepSeek V4.1 Flash (OpenCode) | 11–14.11 | Чистые функции по готовым тестам, эндпоинты по контрактам, сид-данные, тексты справочника, интеграционные тесты | Однотипная работа по шаблону. В это же время Claude делает экраны по тем же контрактам — фазы идут **параллельно** |
| **C. Сборка и качество** | Claude Opus 5.5 | 14–19.11 | Ревью кода DeepSeek (безопасность, соответствие SPEC), интеграция UI с API, PWA и офлайн, PDF, ИИ-помощник, поиск, доступность, эвристическая оценка, полировка | Всё, где важны вкус, UX, безопасность и цельность |
| **D. Мелкие доработки (по желанию)** | DeepSeek | 16–18.11 | Небольшие тикеты, которые Claude сформулирует по итогам ревью: недостающие тесты, правки валидации, расширение сида | Дёшево закрыть хвосты |

**Ответ на вопрос «с кого начать»: с Claude.** Причины:

1. **Архитектура и безопасность — самое дорогое в исправлении.** Изоляция данных (чужую заявку не открыть) — пункт, который жюри почти наверняка проверит руками. Слой доступа должен быть единым и правильным с первого дня.
2. **Тесты и контракты — это ТЗ для дешёвой модели.** Тикет «сделай так, чтобы `pnpm test tests/unit/grading.test.ts` стал зелёным, вот контракт ответа» дешёвая модель выполняет надёжно. Тикет «спроектируй модуль оценок» — нет.
3. **Параллельность.** Пока DeepSeek пишет эндпоинты, Claude строит экраны по тем же типам. Экономится и время, и деньги.

### Что это даёт для критерия «Масштаб использования нейротехнологий»

Маршрутизация моделей по сложности и стоимости — сильный пункт для описания процесса: «архитектура, безопасность и UX — дорогая модель; однотипный бэкенд по контрактам — дешёвая; каждый тикет дешёвой модели проходит ревью дорогой». Обязательно:

- указать DeepSeek V4.1 Flash и OpenCode в перечне инструментов (§12.7 SPEC);
- вести журнал расходов и времени по тикетам (§6 этого файла);
- показать в PDF пример: тикет → код DeepSeek → находка ревью Claude → исправление.

---

## 1. Границы: что DeepSeek делает и чего не трогает никогда

### Разрешено (allowlist путей)

```
src/lib/**                     (кроме src/lib/auth/**)
src/server/services/**
src/server/repositories/**     (только новые файлы и функции по образцу; см. правила §3)
src/server/schemas/**          (Zod-схемы входа)
src/app/api/**/route.ts        (только эндпоинты из этого файла)
db/seed/**                     (кроме db/seed/demo-accounts.ts)
content/kb/**                  (тексты справочника, Markdown)
tests/unit/**  tests/integration/**
docs/ds-questions/**  docs/ai-log/models.md
```

### Запрещено (deny)

| Путь или область | Чьё | Почему |
|---|---|---|
| `src/app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` | Claude | Экраны и UX |
| `src/components/**`, `src/styles/**`, `public/**` | Claude | Графика, дизайн, иконки, шрифты |
| `src/sw/**`, манифест PWA | Claude | Офлайн-режим — ключевая ставка |
| `src/contracts/**` | Claude | Контракты API — общий источник правды для UI и API. Нужна правка — вопрос в `docs/ds-questions/` |
| `src/server/auth/**`, `src/lib/auth/**`, `middleware.ts` | Claude | Аутентификация и роли |
| `src/server/http.ts`, `src/server/db.ts`, `src/server/idempotency.ts` | Claude | Общая обвязка |
| `db/schema/**`, `db/migrations/**`, RLS-политики | Claude | Схема БД |
| `db/seed/demo-accounts.ts` | Claude | Сценарии демо-аккаунтов для жюри |
| `tests/security/**`, `tests/e2e/**`, `playwright.config.ts` | Claude | Обвязка тестов безопасности и UI |
| `package.json`, lock-файл | Claude | Новые зависимости запрещены |
| `.env*`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `opencode.json`, `.github/**` | Человек / Claude | Конфигурация и секреты |
| PDF-шаблоны, ИИ-помощник, поиск (`/api/search`), выдача PDF | Claude | Сложная логика или визуал |
| Любые тексты интерфейса (кнопки, ошибки на экране) | Claude | UX-копирайтинг. В API — только машинные `code` ошибок, без «человеческих» текстов |

---

## 2. Соглашения, которые создаёт Claude в фазе A (DeepSeek их только использует)

> До начала фазы B Claude обязан создать перечисленное. Если чего-то нет — DeepSeek **останавливается** и пишет вопрос (§5).

| Файл | Что внутри | Как использовать |
|---|---|---|
| `src/server/http.ts` | `ok(data, init?)`, `fail(status, code, details?)`, `parseJson(req, schema)`, `parseQuery(url, schema)` | Все ответы только через эти функции |
| `src/server/auth/guards.ts` | `requireStudent(req)` → `{ userId, studentId, groupId, facultyId }`; `requireStaff(req)` → `{ userId, staffId, unitId, facultyId }`; бросают 401 или 403 | **Первая строка каждого обработчика** |
| `src/server/db.ts` | `withUserTx(userId, fn)` — транзакция с `SET LOCAL app.user_id` (для RLS) | Все запросы к личным таблицам — внутри `withUserTx` |
| `src/server/idempotency.ts` | `withIdempotency(req, userId, fn)` | Для всех `POST`, создающих сущности |
| `src/contracts/api.ts` | TypeScript-типы ответов (те же, что в §4) | Обработчик возвращает ровно этот тип |
| `src/lib/time.ts` | `nowMsk()`, `toMsk()`, `startOfDayMsk()`, `MSK = 'Europe/Moscow'` | Никаких `new Date()` в логике — только через `now()` из `src/lib/clock.ts` (подменяется в тестах) |
| `config/holidays.ts` | Праздники и переносы 2026–2027 (заполняет Claude по официальному постановлению) | DeepSeek **не придумывает** даты |
| `config/grading.ts` | Пороги оценок, буквы | Только чтение |
| `src/app/api/me/requests/route.ts` + `[id]/route.ts` | **Эталонный эндпоинт** (список и карточка заявки) с тестами | Копировать структуру для всех новых эндпоинтов |
| `tests/helpers/api.ts` | `apiAs('anna' \| 'maxim' \| 'elena' \| 'guest')`, `resetDb()`, `freezeTime(iso)` | Интеграционные тесты |
| `tests/security/manifest.ts` | Реестр эндпоинтов для автоматической проверки изоляции | **Каждый новый эндпоинт регистрируется здесь** через `docs/ds-questions` → Claude добавляет. DeepSeek сам `tests/security` не правит |
| `tests/unit/*.test.ts` для чистой логики | Готовые падающие тесты (TDD) | DeepSeek делает их зелёными, **не меняя тесты** |

### Формат ошибок API

```ts
// любой ответ с ошибкой
{ "error": { "code": "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL",
             "details"?: unknown } }
```

| Ситуация | Статус | `code` |
|---|---|---|
| Нет сессии | 401 | `UNAUTHORIZED` |
| Студент обращается к `/api/staff/*` | 403 | `FORBIDDEN` |
| Чужой ресурс или несуществующий id | **404** (одинаково!) | `NOT_FOUND` |
| Невалидный вход (Zod) | 422 | `VALIDATION` (+ `details` — ошибки Zod) |
| Недопустимый переход статуса | 409 | `CONFLICT` |
| Превышен лимит | 429 | `RATE_LIMITED` |

### Общие типы

```ts
type ISODateTime = string;   // ISO 8601 с часовым поясом, например "2026-11-12T09:30:00+03:00"
type ISODate = string;       // "2026-11-12"
type UUID = string;

interface Paged<T> { items: T[]; nextCursor: string | null }  // курсорная пагинация, limit по умолчанию 20, максимум 50
```

---

## 3. Железные правила для каждого обработчика

1. **Первая строка** — `requireStudent(req)` или `requireStaff(req)`. Публичные эндпоинты помечены в тикете явно.
2. **Идентификатор пользователя берётся только из сессии.** Если в query или body пришли `studentId` или `userId` — их **игнорировать** (не использовать даже для проверки).
3. **Каждый запрос к личным таблицам** (`requests`, `request_events`, `request_messages`, `grades`, `final_results`, `documents`, `notifications`, `notification_prefs`, `deadlines`, `plans`, `tickets`, `ticket_messages`) содержит условие по владельцу (`student_id = ctx.studentId`) **и** выполняется внутри `withUserTx`.
4. **Чужое = несуществующее = 404.** Никаких 403 для студенческих ресурсов.
5. **Вход валидируется Zod-схемой** из `src/server/schemas/`. Строки обрезаются (`trim`) и ограничиваются по длине (текст сообщения ≤ 2000 символов, заголовок ≤ 120).
6. **Никакого сырого SQL с конкатенацией.** Только Drizzle или `sql\`\`` с параметрами.
7. **Никакого HTML в ответах.** Тексты пользователей возвращаются как есть (экранирует UI). Markdown объявлений хранится в `body_md`, в HTML его превращает Claude.
8. **Время** — через `now()` из `src/lib/clock.ts`; часовой пояс бизнес-логики — Europe/Moscow.
9. **Без новых зависимостей.** Нужна библиотека — вопрос в `docs/ds-questions/`.
10. **Логи без персональных данных и паролей.** Никаких `console.log(body)`.
11. **Тексты для людей не пишем** (кроме справочника в `content/kb`). В API — только `code`.

---

## 4. Тикеты

Формат каждого тикета: **цель → файлы → контракт → правила → готово, когда.**
Порядок выполнения — по номерам: сначала чистая логика (её используют эндпоинты).
Каждый тикет — **отдельная сессия OpenCode** (свежий контекст дешевле и чище) и отдельная ветка `ds/DS-XX`.

**Команда проверки одного тикета:**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run <файлы тестов тикета>
```

**Команда проверки перед коммитом:** `pnpm verify:ds` (типы + линтер + все юнит- и интеграционные тесты).

---

### Блок 1. Чистая логика (тесты уже написаны Claude, их не менять)

#### DS-01. Рабочие дни и срок готовности заявки

- **Файлы:** `src/lib/workdays.ts`; тесты `tests/unit/workdays.test.ts` (готовые).
- **Контракт:**
  ```ts
  export function isWorkday(date: ISODate): boolean;
  export function addWorkdays(from: ISODateTime, days: number): ISODateTime; // результат — 18:00 МСК последнего рабочего дня
  export function workdaysBetween(a: ISODateTime, b: ISODateTime): number;
  ```
- **Правила:** выходные — сб и вс; праздники и рабочие субботы-переносы — из `config/holidays.ts`. Заявка, поданная после 17:00 МСК, считается поданной в следующий рабочий день. SPEC §6.5 п.6.
- **Готово, когда:** `tests/unit/workdays.test.ts` зелёный.

#### DS-02. Слот дайджеста

- **Файлы:** `src/lib/digest.ts`; тесты `tests/unit/digest.test.ts`.
- **Контракт:**
  ```ts
  export type NotificationClass = 'urgent' | 'personal' | 'info';
  export function digestSlot(createdAt: ISODateTime, slotsMinutes: number[], quiet: { from: number; to: number }): ISODateTime;
  // urgent: вернуть createdAt, но если попадает в тихие часы — первый момент после них (SPEC §6.6)
  export function deliveryTime(cls: NotificationClass, createdAt: ISODateTime, prefs: { slots: number[]; quietFrom: number; quietTo: number; immediateCategories: string[] }, category: string): ISODateTime;
  ```
- **Правила:** SPEC §6.6 («Логика назначения слота дайджеста»). Категории из `immediateCategories` доставляются сразу (личный контроль, v1.1).
- **Готово, когда:** тесты зелёные, включая границы 12:59, 13:00, 13:01 и переход через полночь.

#### DS-03. Математика оценок

- **Файлы:** `src/lib/grading.ts`; тесты `tests/unit/grading.test.ts`.
- **Контракт:**
  ```ts
  export interface Item { score: number | null; max: number; weight: number }   // score null = ещё не сдано
  export function totalScore(items: Item[]): number;                           // S по формуле SPEC §6.4, округление до 1 знака
  export function markFor(total: number): { mark: 2 | 3 | 4 | 5; word: string; letter: string }; // пороги из config/grading.ts
  export function neededFor(items: Item[], targetTotal: number): { needed: number; achievable: boolean; maxPossible: number };
  ```
- **Готово, когда:** тесты зелёные (ничего не сдано; всё сдано; цель недостижима; вес 0).

#### DS-04. Статус семестра

- **Файлы:** `src/lib/semester-status.ts`; тесты готовы.
- **Контракт:**
  ```ts
  export type SemesterStatus = 'ok' | 'risk' | 'action';
  export function semesterStatus(courses: Array<{ courseId: UUID; items: Item[]; passThreshold: number; admitted: boolean | null; hasDebt: boolean; missedDeadlines: number }>):
    { status: SemesterStatus; reasons: Array<{ courseId: UUID; reason: 'NEED_OVER_70' | 'MISSED_DEADLINE' | 'NOT_ADMITTED' | 'DEBT' }> };
  ```
- **Правила:** таблица «Статус семестра» в SPEC §6.4.

#### DS-05. Свободные окна для планов

- **Файлы:** `src/lib/windows.ts`; тесты готовы.
- **Контракт:**
  ```ts
  export function freeWindows(classes: Array<{ startsAt: ISODateTime; endsAt: ISODateTime }>, from: ISODateTime, days: number, opts?: { minMinutes?: number; dayStart?: string; dayEnd?: string }):
    Array<{ startsAt: ISODateTime; endsAt: ISODateTime }>;   // не пересекаются с парами; по умолчанию minMinutes 60, день 09:00–22:00 МСК
  ```

#### DS-06. Конечный автомат заявки

- **Файлы:** `src/lib/request-fsm.ts`; тесты готовы.
- **Контракт:**
  ```ts
  export type RequestStatus = 'submitted' | 'in_progress' | 'needs_info' | 'ready' | 'issued' | 'rejected' | 'cancelled';
  export type RequestAction = 'take' | 'need_info' | 'student_reply' | 'ready' | 'issue' | 'reject' | 'cancel';
  export function canTransition(from: RequestStatus, action: RequestAction, actor: 'student' | 'staff'): boolean;
  export function nextStatus(from: RequestStatus, action: RequestAction): RequestStatus; // бросает ошибку при недопустимом переходе
  ```
- **Правила:** схема статусов SPEC §6.5. `cancel` — только студент и только из `submitted`; `student_reply` — только студент и только из `needs_info`; остальные — только сотрудник. Недопустимый переход — `InvalidTransitionError` из того же файла.

#### DS-07. Главный блок «Сегодня» (логика выбора hero-карточки)

- **Файлы:** `src/lib/today.ts`; тесты готовы (5 веток + границы).
- **Контракт:**
  ```ts
  export type Hero =
    | { kind: 'change'; classId: UUID; change: ScheduleChangeDTO }
    | { kind: 'now'; classId: UUID; endsAt: ISODateTime }
    | { kind: 'soon'; classId: UUID; startsAt: ISODateTime }
    | { kind: 'done_today'; nextClassAt: ISODateTime | null }
    | { kind: 'day_off'; nextClassAt: ISODateTime | null };
  export function pickHero(now: ISODateTime, todayClasses: ClassDTO[], unseenChanges: ScheduleChangeDTO[], nextClassAt: ISODateTime | null): Hero;
  ```
- **Правила:** порядок приоритета SPEC §6.2. Типы `ClassDTO` и `ScheduleChangeDTO` — из `src/contracts/api.ts`. Случай «пара сегодня позже чем через 3 ч» — `day_off` с началом этой пары (D-003); точные правила веток — в шапке `tests/unit/today.test.ts`.
- **Сложность:** средняя. Если два прогона подряд тесты не проходят — остановиться и написать вопрос (§5).

---

### Блок 2. Эндпоинты студента (`/api/me/*`)

> Для всех: `requireStudent` первой строкой; образец — эталон `src/app/api/me/requests/`; ответы — типы из `src/contracts/api.ts`; интеграционные тесты в `tests/integration/<имя>.test.ts`: успешный ответ, валидация, **и обязательно** «Максим не видит данные Ани» (404 или отсутствие в списке).

#### DS-10. `GET /api/me` — профиль

```ts
// 200
interface MeDTO {
  userId: UUID; login: string; role: 'student';
  fullName: { last: string; first: string; middle: string | null };
  displayName: string;
  faculty: { id: UUID; title: string };
  program: { id: UUID; code: string; title: string; level: 'bachelor' | 'master' | 'specialist' | 'postgraduate' };
  course: number; group: { id: UUID; title: string };
  studyForm: 'full_time' | 'part_time' | 'evening';
  studentCardNo: string;           // формат "DEMO-…"
  admissionYear: number; status: 'studying' | 'academic_leave';
  onboardingDone: boolean;
}
```

`PATCH /api/me` — разрешено менять только `displayName` (1–40 символов) и `onboardingDone`. Остальные поля в теле игнорируются.

#### DS-11. `GET /api/me/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` — расписание

- Валидация: `from ≤ to`, диапазон ≤ 31 день; по умолчанию текущая неделя (пн–вс, МСК).
- Источник: пары группы студента + курсы из `enrollments`; изменения из `schedule_changes` применяются к выдаче.

```ts
interface ClassDTO {
  id: UUID;
  course: { id: UUID; title: string; shortTitle: string; colorIndex: number }; // 0..9
  type: 'lecture' | 'seminar' | 'practice' | 'exam' | 'consultation';
  startsAt: ISODateTime; endsAt: ISODateTime;            // уже с учётом переноса
  room: { id: UUID; building: string; number: string; floor: number | null; hint: string | null };
  teacher: { id: UUID; fullName: string; email: string | null; officeHours: string | null };
  weekParity: 'odd' | 'even' | null;
  change: ScheduleChangeDTO | null;
  note: string | null;                                    // личная заметка студента
}
interface ScheduleChangeDTO {
  id: UUID; type: 'cancelled' | 'moved' | 'room_changed' | 'teacher_changed' | 'added';
  previous: { startsAt: ISODateTime; endsAt: ISODateTime; roomNumber: string } | null;
  reason: string | null; createdAt: ISODateTime; seen: boolean;
}
// 200
interface ScheduleDTO { from: ISODate; to: ISODate; weekNumber: number; weekParity: 'odd' | 'even' | null; classes: ClassDTO[]; ghostSlots: Array<{ classId: UUID; originalStartsAt: ISODateTime; movedTo: ISODateTime }> }
```

- Перенесённая пара: в `classes` — на новом месте, в `ghostSlots` — «призрак» на старом (SPEC §6.3 п.5).
- `POST /api/me/schedule/changes/seen` — тело `{ changeIds: UUID[] }` (до 50), отмечает изменения просмотренными. 204.
- `PUT /api/me/classes/:classId/note` — тело `{ text: string }` (0–500, пустая строка удаляет). 200 `{ note: string | null }`. Пара должна принадлежать расписанию студента, иначе 404.

#### DS-12. `GET /api/me/grades?semester=2026-1` — успеваемость семестра

```ts
interface GradesDTO {
  semester: string; semesters: string[];                  // список для переключателя
  status: { status: 'ok' | 'risk' | 'action'; reasons: Array<{ courseId: UUID; reason: string }> }; // из DS-04
  averagePreliminary: number | null;                       // 1 знак после запятой
  daysToSession: number | null;
  courses: Array<{
    courseId: UUID; title: string; control: 'exam' | 'credit' | 'graded_credit';
    total: number; maxSoFar: number;                       // для кольца прогресса
    mark: { value: 2|3|4|5; word: string; letter: string } | null;
    credit: { passed: boolean | null; conditions: Array<{ label: string; met: boolean }> } | null; // для зачёта
    risk: boolean;
  }>;
}
```

#### DS-13. `GET /api/me/grades/:courseId` — дисциплина

```ts
interface CourseGradesDTO {
  courseId: UUID; title: string; teacher: { fullName: string; email: string | null; officeHours: string | null };
  control: 'exam' | 'credit' | 'graded_credit'; rulesText: string;
  items: Array<{ id: UUID; title: string; type: string; dueAt: ISODateTime | null; score: number | null; max: number; weight: number; gradedAt: ISODateTime | null }>;
  history: Array<{ itemId: UUID; oldScore: number | null; newScore: number; changedAt: ISODateTime; changedBy: string }>;
  total: number; mark: { value: 2|3|4|5; word: string; letter: string } | null;
  needed: { target: 3|4|5; needed: number; achievable: boolean }[];   // из DS-03 для 3, 4, 5
  peerGoal: null;   // сравнение с целью делает Claude (SPEC §6.4 п.9); DeepSeek всегда возвращает null
}
```

#### DS-14. `GET /api/me/session` — сессия

```ts
interface SessionDTO {
  startsOn: ISODate | null; endsOn: ISODate | null;
  items: Array<{ id: UUID; courseTitle: string; type: 'exam' | 'credit' | 'graded_credit';
                 startsAt: ISODateTime; room: string; consultationAt: ISODateTime | null;
                 admitted: boolean | null; admissionReason: string | null }>;
}
```

#### DS-15. Дедлайны и планы

- `GET /api/me/deadlines?status=active|done` →
  ```ts
  interface DeadlineDTO { id: UUID; source: 'assessment' | 'admin' | 'personal'; title: string; courseTitle: string | null;
                          dueAt: ISODateTime; starred: boolean; done: boolean; risk: boolean;
                          plan: { id: UUID; startsAt: ISODateTime; endsAt: ISODateTime; place: string; firstAction: string } | null }
  // 200: { groups: { hot: DeadlineDTO[]; week: DeadlineDTO[]; later: DeadlineDTO[]; done: DeadlineDTO[] } }  — hot = ≤ 48 ч
  ```
- `POST /api/me/deadlines` — личный дедлайн `{ title (1–120), dueAt }` → 201 `DeadlineDTO`.
- `POST /api/me/deadlines/:id/star` и `/unstar`, `/done` и `/undone` → 200 `DeadlineDTO`.
- `GET /api/me/deadlines/:id/windows` → 200 `{ windows: Array<{ startsAt; endsAt }> }` (3 ближайших, DS-05).
- `POST /api/me/plans` — `{ deadlineId, startsAt, endsAt, place (1–60), firstAction (1–120) }` → 201. Правило: план только для дедлайна со `starred = true` или `risk = true`, иначе 422 `{ code: 'VALIDATION', details: { reason: 'NOT_STARRED' } }`. Создаёт личное уведомление на `startsAt` (через `notify`, DS-18).
- `DELETE /api/me/plans/:id` → 204.

#### DS-16. `GET /api/request-types` — каталог справок

- Публичный для авторизованных студентов. Данные — из сида (DS-42).
```ts
interface RequestTypeDTO { code: string; title: string; hint: string; synonyms: string[]; slaDays: number;
                           delivery: Array<'electronic' | 'original'>; popular: boolean;
                           formSchema: Array<{ name: string; kind: 'text' | 'select' | 'number' | 'textarea'; label: string; required: boolean; options?: string[]; min?: number; max?: number }> }
// 200: { items: RequestTypeDTO[] }
```
`label` в `formSchema` — техническая подпись из сида; финальные формулировки правит Claude.

#### DS-17. Заявки: создание, отмена, переписка

> Список и карточка (`GET /api/me/requests`, `GET /api/me/requests/:id`) — **эталон Claude**. Тип `RequestDTO` — в контрактах.

- `POST /api/me/requests` — заголовок `Idempotency-Key` обязателен (иначе 422); тело `{ typeCode, delivery, copies (1–5), fields: Record<string, string|number> }`; `fields` валидируются по `formSchema` типа. Номер — формат `СП-ГГММ-NNNN` (последовательность в БД). `dueAt` — `addWorkdays` (DS-01). Событие в `request_events`: `null → submitted`. Обёртка `withIdempotency`. Лимит: 10 в час на студента → 429. Ответ 201 `RequestDTO`.
- `POST /api/me/requests/:id/cancel` → 200 `RequestDTO`; недопустимо (DS-06) → 409.
- `POST /api/me/requests/:id/messages` — `{ body (1–2000) }`. Если статус `needs_info` — переход `student_reply` (→ `in_progress`) и событие. 201 `{ message: MessageDTO; request: RequestDTO }`.
- `POST /api/me/requests/:id/resubmit` — только из `rejected`: создаёт **новую** заявку с теми же полями + `fields` из тела (перезапись), ссылка `resubmittedFrom`. 201 `RequestDTO` (SPEC §6.5 п.10).
- `POST /api/me/data-fix` — заявка типа `data_fix`: `{ field: 'fullName' | 'group' | 'program' | 'contacts' | 'other', comment (1–1000) }` → 201 `RequestDTO` (SPEC §6.1 п.12).

#### DS-18. Уведомления

- `GET /api/me/notifications?tab=all|important|announcements&cursor=` →
  ```ts
  interface NotificationDTO { id: UUID; class: 'urgent' | 'personal' | 'info'; category: 'schedule' | 'request' | 'grade' | 'deadline' | 'announcement' | 'ticket' | 'plan';
                              title: string; body: string; link: { kind: 'class' | 'request' | 'course' | 'deadline' | 'announcement' | 'ticket'; id: UUID };
                              createdAt: ISODateTime; deliverAt: ISODateTime; readAt: ISODateTime | null }
  // 200: Paged<NotificationDTO> & { unread: { urgent: number; personal: number; info: number } }
  ```
  Отдаются только уведомления с `deliverAt ≤ now()` (дайджест «копится»).
- `POST /api/me/notifications/read` — `{ ids: UUID[] } | { all: true }` → 204.
- `GET /api/me/notification-prefs` / `PUT` — `{ slots: number[] (1–4, минуты 0–1439, по возрастанию), preset: 'default' | 'evening' | 'custom', quietFrom, quietTo, immediateCategories: string[], disabledCategories: string[] }`. Категории `schedule` и класс `urgent` выключить нельзя (422).
- **Сервис `src/server/services/notify.ts`** — `notify(tx, { studentIds | groupIds | audience, class, category, title, body, link })`: рассчитывает `deliverAt` по DS-02 для каждого получателя; **дебаунс 2 минуты** по паре `(category, link.id)` — повторное событие обновляет текст существующего непрочитанного уведомления, а не создаёт новое (SPEC §6.6, «Тонкости»). `title` и `body` — шаблоны из `src/server/services/notify-templates.ts`. Шаблоны пишет **Claude**; DeepSeek вызывает их по ключу.

#### DS-19. `GET /api/me/documents` — выданные документы

```ts
interface DocumentDTO { id: UUID; requestId: UUID; typeTitle: string; issuedAt: ISODateTime; verifyUrl: string; fileUrl: string } // fileUrl = /api/me/documents/:id/file (эндпоинт файла делает Claude)
// 200: { items: DocumentDTO[] }
```

#### DS-20. `GET /api/me/today` — агрегат главной

```ts
interface TodayDTO {
  now: ISODateTime; greeting: 'morning' | 'day' | 'evening' | 'night';
  hero: Hero;                                   // DS-07
  classes: ClassDTO[];                          // сегодня, по времени
  passedCount: number;
  hot: Array<{ kind: 'deadline'; deadline: DeadlineDTO } | { kind: 'request'; request: RequestDTO }>; // ≤ 3: дедлайны ≤ 48 ч, заявки ready/needs_info
  news: Array<{ id: UUID; title: string; important: boolean; publishedAt: ISODateTime }>; // ≤ 2
  dataAsOf: ISODateTime;
}
```
Ответ ≤ 300 мс p95 на сиде: без N+1 (проверка — тест с подсчётом запросов, хелпер `countQueries` в `tests/helpers`).

#### DS-21. Обращения в деканат

- `GET /api/me/tickets` → `{ items: TicketDTO[] }`; `POST /api/me/tickets` — `{ topic: 'schedule'|'grades'|'requests'|'dorm'|'scholarship'|'other', body (1–2000), link?: { kind, id } }` (связанный объект должен принадлежать студенту, иначе 404) → 201.
- `GET /api/me/tickets/:id` → `TicketDTO & { messages: MessageDTO[] }`; `POST /api/me/tickets/:id/messages` → 201.
```ts
interface TicketDTO { id: UUID; topic: string; status: 'open' | 'answered' | 'closed'; createdAt: ISODateTime; lastMessageAt: ISODateTime; unread: boolean }
interface MessageDTO { id: UUID; author: 'student' | 'staff'; authorName: string; body: string; createdAt: ISODateTime }
```

#### DS-22. Календарь ICS

- `GET /api/ics/:token.ics` — **публичный** (без сессии): токен 256 бит, в БД хранится SHA-256. Отдаёт пары (±4 недели) и дедлайны со звёздочкой. `Content-Type: text/calendar; charset=utf-8`. Неверный токен → 404. Лимит 60 запросов в час на токен.
- `GET /api/me/ics` → `{ url: string }` (создаёт токен, если нет); `POST /api/me/ics/rotate` → `{ url }` (старый перестаёт работать).
- Генерация — через уже установленную библиотеку `ics` (её ставит Claude в фазе A). Поля события: SUMMARY (курс и тип), LOCATION (корпус и аудитория), DESCRIPTION (преподаватель), UID = `class-<id>@kompas`.
- **Тест:** файл парсится `ical.js` (есть в devDependencies), количество событий совпадает с данными.

#### DS-23. `GET /api/verify/:code` — проверка подлинности справки (публичный)

- Код — 128-битный токен; в БД — хеш. Ответ 200 `{ found: true, typeTitle, issuedAt, valid: boolean }` или `{ found: false }` (тоже 200, чтобы не различать по статусу). **Без ФИО, группы, номера заявки** — тест проверяет отсутствие фамилии в ответе. Лимит 30 в минуту на IP.

---

### Блок 3. Эндпоинты сотрудника (`/api/staff/*`)

> Для всех: `requireStaff` первой строкой; сотрудник видит только объекты **своего подразделения или факультета** (`ctx.unitId`, `ctx.facultyId`); чужое — 404. Все изменения пишутся в `audit_log` через `audit(tx, action, entity, id, meta)` (хелпер Claude). Тест: «Аня (студент) получает 403 на каждый маршрут», «сотрудник другого факультета получает 404».

#### DS-30. Очередь и обработка заявок

- `GET /api/staff/requests?status=&type=&overdue=true&mine=true&cursor=&sort=dueAt` →
  ```ts
  interface StaffRequestRowDTO { id: UUID; number: string; typeTitle: string; student: { fullName: string; group: string };
                                 createdAt: ISODateTime; dueAt: ISODateTime; overdue: boolean; status: RequestStatus; assignee: string | null }
  // 200: Paged<StaffRequestRowDTO> & { counters: { submitted: number; inProgress: number; overdue: number } }
  ```
- `GET /api/staff/requests/:id` → `StaffRequestDTO` (поля заявки, данные студента — **только** ФИО, группа, программа, курс; без оценок), история, сообщения.
- `POST /api/staff/requests/:id/transition` — `{ action: 'take'|'need_info'|'ready'|'issue'|'reject', comment?: string, rejectReason?: 'INCOMPLETE'|'NOT_ELIGIBLE'|'DUPLICATE'|'OTHER' }`. Правила: `need_info` требует `comment`; `reject` требует `rejectReason` и `comment` (иначе 422); недопустимый переход — 409. `take` назначает исполнителя. **`ready` для электронных типов** вызывает `issueDocument(tx, requestId)` — это функция Claude (PDF), DeepSeek только вызывает её. После перехода — `notify` студенту (категория `request`; `needs_info` и `ready` → класс `urgent`, остальное → `personal`).
- `POST /api/staff/requests/:id/messages` — `{ body }` → 201.

#### DS-31. Объявления

- `GET /api/staff/announcements?cursor=` · `POST /api/staff/announcements` — `{ title (1–120), bodyMd (1–5000), audience: { facultyIds?: UUID[]; courses?: number[]; groupIds?: UUID[] }, important: boolean, publishAt?: ISODateTime, expiresAt?: ISODateTime }`. Аудитория — только в пределах факультета сотрудника (иначе 422). При публикации — `notify` всем адресатам: `important` → `urgent`, иначе `info`.
- `POST /api/staff/announcements/:id/archive` → 200.
- `GET /api/me/announcements?cursor=` (для студента) — только объявления, где студент входит в аудиторию и `publishAt ≤ now < expiresAt`. Тест: группа Г1 не видит объявление для Г2.

#### DS-32. Изменения расписания

- `GET /api/staff/classes?date=YYYY-MM-DD&groupId=` — пары факультета сотрудника за день.
- `POST /api/staff/classes/:id/changes` — `{ type: 'cancelled'|'moved'|'room_changed'|'teacher_changed', newStartsAt?, newEndsAt?, newRoomId?, newTeacherId?, reason? (≤ 200) }`. Валидация по типу. Запись в `schedule_changes`; `notify` всем студентам пары: если пара сегодня или завтра → `urgent`, иначе `personal` (категория `schedule`, дебаунс из DS-18).
- Тест: студент другой группы уведомление **не** получает.

#### DS-33. Обращения (сторона сотрудника)

- `GET /api/staff/tickets?status=` · `GET /api/staff/tickets/:id` · `POST /api/staff/tickets/:id/messages` (статус → `answered`, `notify` студенту) · `POST /api/staff/tickets/:id/close`.

---

### Блок 4. Данные и контент

#### DS-40. Генератор фоновой популяции

- **Файлы:** `db/seed/population.ts`.
- 3 факультета, 6 программ, 8 групп, 34 фоновых вымышленных студента (демо-студентов и студентов очереди делает Claude), 25 преподавателей, 30 аудиторий в 4 корпусах, 18 дисциплин, расписание семестра, 200+ оценок, 60 заявок во всех статусах, 30 объявлений.
- ФИО — только `@faker-js/faker` с локалью `ru` или списки распространённых имён в случайных сочетаниях; e-mail — `@example.edu`; номера — `DEMO-…`. **Все даты — относительно `today`** через `db/seed/dates.ts` (SPEC §11.3).
- Сид детерминирован: `faker.seed(2026)`.
- **Уточнение (Claude, D-003).** `db/seed/demo-accounts.ts` уже создаёт 2 демо-студентов, 4 студентов очереди Елены, 3 факультета, 3 программы, группы Б-ЭК-101 и М-ЦМ-11, 5 преподавателей, 5 аудиторий и 5 дисциплин. Популяция дополняет до объёмов выше: фоновых студентов 34, итого 40. Для групп Б-ЭК-101 и М-ЦМ-11 популяция не создаёт пары, оценки и экзамены. Фоновых студентов в эти группы добавлять можно. Заявки популяции — только в статусах `needs_info`, `ready`, `issued`, `rejected`, `cancelled`: точные счётчики очереди Елены (4 новых, 6 в работе, 1 просрочена) задаёт demo-accounts.ts.
- **Готово, когда:** `pnpm db:reset && pnpm db:seed` проходит за ≤ 30 с; тест `tests/integration/seed.test.ts` проверяет объёмы и отсутствие e-mail вне `@example.edu`.

#### DS-41. Справочник студента (25 статей)

- **Файлы:** `content/kb/*.md` с front-matter `{ slug, title, tags, updatedAt }`.
- Темы — SPEC §11.4. Каждая статья: 150–400 слов, структура «Что это → Кто может → Шаги → Сроки → Куда обратиться». Первая строка каждой статьи: «*Вымышленные правила для демонстрации концепта.*»
- Стиль: на «вы», простыми словами, без канцелярита; персона Ли Вэй (иностранный студент) должна понять текст.
- **Не придумывать** реальные законы, номера приказов, суммы стипендий, телефоны. Только условные значения с пометкой «пример».
- **Готово, когда:** 25 файлов, загрузчик `pnpm kb:import` (пишет Claude) импортирует их без ошибок. Финальную редактуру делает Claude (субагент `ux-copy-editor`).

#### DS-42. Каталог справок

- **Файлы:** `db/seed/request-types.ts` — 10 типов из таблицы SPEC §6.5 + `data_fix`; `synonyms` («военкомат», «виза», «академ», «стипуха»…); `formSchema` по типу.

---

## 5. Когда остановиться и спросить (а не придумывать)

Остановиться, создать файл `docs/ds-questions/DS-XX.md` (что неясно, какие варианты, что предлагаешь) и **закончить сессию**, если:

- нужен файл или поле, которых нет (схема БД, контракт, хелпер);
- тест противоречит SPEC или другому тесту;
- для решения хочется изменить запрещённый файл или добавить зависимость;
- два прогона подряд не сделали тесты зелёными;
- задача требует решения про UX, тексты интерфейса или безопасность, не описанного здесь.

Изменять тесты, чтобы они прошли, **запрещено**. Отключать проверки (`// @ts-ignore`, `eslint-disable`, `.skip`) **запрещено**.

---

## 6. Протокол работы и учёт стоимости

0. Рабочая копия: `scripts/ds-worktree.sh DS-XX` — ветка `ds/DS-XX` от `main` в `../kompas-ds`, свои базы `kompas_ds_dev`/`kompas_ds_test`, `pnpm install`; прогоны не мешают основной папке.
1. Человек открывает новую сессию OpenCode в `../kompas-ds` (ветка `ds/DS-XX`) и даёт промпт:
   ```
   Прочитай AGENTS.md и docs/DEEPSEEK-TASKS.md: §1–3 и тикет DS-XX.
   Посмотри эталон src/app/api/me/requests/ и его тесты.
   Выполни только DS-XX. Не трогай файлы вне разрешённых.
   В конце запусти команду проверки тикета и покажи её вывод.
   Если упираешься в правила §5 — создай docs/ds-questions/DS-XX.md и остановись.
   ```
2. DeepSeek коммитит: `DS-XX: <кратко>`, тело — что сделано и вывод проверки.
3. Человек дописывает строку в `docs/ai-log/models.md`:

   | Тикет | Модель | Время | Токены вход/выход | Стоимость | Тесты с первой попытки? | Находки ревью |
   |---|---|---|---|---|---|---|

4. Раз в день (или после 3–5 тикетов) — сессия Claude Code: «Сделай ревью веток `ds/*`: субагенты `security-auditor` и `spec-reviewer`, исправь находки, смёрджи в `main`». Находки записываются в `docs/ai-log/errors.md` с пометкой модели — это готовый материал для PDF («работа с ошибками ИИ»).
5. Все эндпоинты DS-10…DS-33 уже зарегистрированы в `tests/security/manifest.ts` с пометкой `pending`: проверки маршрута включаются сами, как только появляется `route.ts`. При приёмке Claude снимает `pending`.

**Оценка экономии.** Блоки 1–4 — около 35–45% всего кода проекта по объёму, но это однотипная работа. По тарифам DeepSeek V4.1 Flash (на OpenRouter — около $0,006 за 1 млн входных и $0,50 за 1 млн выходных токенов; у других провайдеров цены отличаются) весь бэкенд обойдётся в единицы долларов. Реальные цифры берём из журнала, а не из этой оценки.

---

## Приложение A. `AGENTS.md` для OpenCode

> OpenCode читает `AGENTS.md`, а `CLAUDE.md` — только если `AGENTS.md` нет. Claude Code читает `CLAUDE.md`. Поэтому **у каждой модели свой файл правил**, и они не мешают друг другу. Чтобы OpenCode не подхватывал навыки Claude из `.claude/skills`, запускайте его с переменной `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`.

```markdown
# Компас — правила для DeepSeek (OpenCode)

Ты выполняешь бэкенд-тикеты из docs/DEEPSEEK-TASKS.md. Один тикет за сессию.
Источник правды о продукте — docs/SPEC.md. Контракты API — src/contracts/api.ts (не менять).

## Команды
- Проверка тикета: pnpm typecheck && pnpm lint && pnpm vitest run <тесты тикета>
- Полная проверка: pnpm verify:ds
- Сброс и сид БД: pnpm db:reset && pnpm db:seed
- Базы: ты работаешь в ../kompas-ds, тесты идут в kompas_ds_test (TEST_DATABASE_URL), сид — в kompas_ds_dev; kompas_dev и kompas_test не трогай.

## Нельзя
- Трогать UI: src/app/**/page.tsx, layout.tsx, src/components, src/styles, public, src/sw.
- Трогать: src/contracts, src/server/auth, middleware.ts, db/schema, db/migrations, tests/security, tests/e2e, package.json, .env*, .claude, CLAUDE.md, .github.
- Менять тесты, чтобы они прошли. Ставить .skip, @ts-ignore, eslint-disable.
- Добавлять зависимости. Писать тексты интерфейса.

## Обязательно в каждом эндпоинте
1. Первая строка: requireStudent(req) или requireStaff(req).
2. userId/studentId только из сессии; из запроса — игнорировать.
3. Личные таблицы — только внутри withUserTx и с условием по владельцу.
4. Чужое или несуществующее — 404 NOT_FOUND.
5. Вход — через Zod-схему из src/server/schemas.
6. Время — через now() из src/lib/clock.ts, пояс Europe/Moscow.
7. Ответ — через ok()/fail() из src/server/http.ts и тип из src/contracts/api.ts.

## Если что-то неясно
Создай docs/ds-questions/DS-XX.md и остановись. Не придумывай.
```

## Приложение B. `opencode.json` (права)

> Формат прав в OpenCode V2 — массив `permissions` (действия `edit`, `read`, `shell`). Последнее подходящее правило побеждает, `deny` нельзя перебить сохранённым одобрением. В V1 формат другой (`permission`, `bash`) — сверьтесь с документацией своей версии: https://opencode.ai/docs/permissions/

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["docs/DEEPSEEK-TASKS.md"],
  "permissions": [
    { "action": "edit", "resource": "*", "effect": "deny" },
    { "action": "edit", "resource": "src/lib/*", "effect": "allow" },
    { "action": "edit", "resource": "src/server/services/*", "effect": "allow" },
    { "action": "edit", "resource": "src/server/repositories/*", "effect": "allow" },
    { "action": "edit", "resource": "src/server/schemas/*", "effect": "allow" },
    { "action": "edit", "resource": "src/app/api/*/route.ts", "effect": "allow" },
    { "action": "edit", "resource": "db/seed/*", "effect": "allow" },
    { "action": "edit", "resource": "content/kb/*", "effect": "allow" },
    { "action": "edit", "resource": "tests/unit/*", "effect": "allow" },
    { "action": "edit", "resource": "tests/integration/*", "effect": "allow" },
    { "action": "edit", "resource": "docs/ds-questions/*", "effect": "allow" },
    { "action": "edit", "resource": "docs/ai-log/models.md", "effect": "allow" },

    { "action": "edit", "resource": "src/lib/auth/*", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/auth/*", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/me/requests/route.ts", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/me/requests/?id?/route.ts", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/me/documents/?id?/file/*", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/assistant/*", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/search/*", "effect": "deny" },
    { "action": "edit", "resource": "src/app/api/jury/*", "effect": "deny" },
    { "action": "edit", "resource": "db/seed/demo-accounts.ts", "effect": "deny" },
    { "action": "edit", "resource": "tests/unit/*.test.ts", "effect": "ask" },

    { "action": "read", "resource": "*.env", "effect": "deny" },
    { "action": "read", "resource": "*.env.*", "effect": "deny" },
    { "action": "read", "resource": "*.env.example", "effect": "allow" },

    { "action": "shell", "resource": "*", "effect": "ask" },
    { "action": "shell", "resource": "pnpm typecheck*", "effect": "allow" },
    { "action": "shell", "resource": "pnpm lint*", "effect": "allow" },
    { "action": "shell", "resource": "pnpm vitest *", "effect": "allow" },
    { "action": "shell", "resource": "pnpm verify:ds*", "effect": "allow" },
    { "action": "shell", "resource": "pnpm db:reset*", "effect": "allow" },
    { "action": "shell", "resource": "pnpm db:seed*", "effect": "allow" },
    { "action": "shell", "resource": "git status*", "effect": "allow" },
    { "action": "shell", "resource": "git diff*", "effect": "allow" },
    { "action": "shell", "resource": "git add *", "effect": "allow" },
    { "action": "shell", "resource": "git commit *", "effect": "allow" },
    { "action": "shell", "resource": "git push*", "effect": "deny" },
    { "action": "shell", "resource": "pnpm add*", "effect": "deny" },
    { "action": "shell", "resource": "npm install*", "effect": "deny" },
    { "action": "shell", "resource": "rm -rf*", "effect": "deny" }
  ]
}
```

В шаблонах `?` означает ровно один символ: `?id?` совпадает с папкой `[id]` в Next.js (квадратные скобки в шаблонах OpenCode не документированы, поэтому не используем их). После первой сессии проверьте, что запреты срабатывают: попросите DeepSeek изменить `src/app/api/me/requests/[id]/route.ts` — он должен получить отказ.

Тесты в `tests/unit/*.test.ts` помечены `ask`. DeepSeek может добавлять новые тест-файлы, но правка существующего (готового от Claude) требует подтверждения человека. Если DeepSeek просит изменить готовый тест — отвечайте «нет» и смотрите `docs/ds-questions/`.

## Приложение C. Чек-лист Claude перед стартом фазы B

- [x] `src/contracts/api.ts` содержит все типы из §4. — 612 строк, `tsc` зелёный
- [x] Эталон `GET /api/me/requests` и `GET /api/me/requests/:id` с интеграционными тестами и тестом изоляции. — `tests/integration/me-requests.test.ts`, матрица в `idor.spec.ts`
- [x] `http.ts`, `guards.ts`, `db.ts` (`withUserTx`), `idempotency.ts`, `clock.ts`, `time.ts`, `audit.ts`, `notify-templates.ts`. — файлы в `src/server`, `src/lib`; 43 ключа шаблонов в `NOTIFY_KEYS`
- [x] Падающие юнит-тесты для DS-01…DS-07. — 7 файлов, 265 тестов; исключены из Stop-хука через `.claude/ds-pending.txt`
- [x] `config/holidays.ts` и `config/grading.ts` заполнены. — постановления № 1466 и № 1187 в шапке, 247 рабочих дней в году; сомнительное — 1 TODO
- [x] Хелперы тестов: `apiAs`, `resetDb`, `freezeTime`, `countQueries`. — `tests/helpers/api.ts`, `clock.ts`
- [x] Схема БД со всеми таблицами SPEC §10.4 и RLS-политиками. — `db/migrations/0000_init.sql`, `0001_rls.sql`; `tests/security/rls.spec.ts`
- [x] Установлены зависимости, нужные тикетам: `ics`, `ical.js` (dev), `@faker-js/faker`, `rate-limiter-flexible`. — `package.json`, записи в `LICENSES.md`
- [x] Скрипт `pnpm verify:ds`. — `package.json`
- [x] `AGENTS.md` и `opencode.json` из приложений A и B закоммичены. — коммит 977f2d0
- [x] Раздельные базы `kompas_dev` / `kompas_test` / `kompas_ds_*`, guard `TEST_DATABASE_URL` — D-004.
- [x] `scripts/ds-worktree.sh` и `.claude/ds-pending.txt` — D-004.
- [x] Манифест безопасности со всеми маршрутами DS-10…DS-33 (`pending`) и фабриками фикстур — D-004.

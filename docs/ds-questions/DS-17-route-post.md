# DS-17 (маршрут): POST в эталонный `src/app/api/me/requests/route.ts`

## Что неясно

Тикет DS-17 требует `POST /api/me/requests` (создание заявки). Файл `src/app/api/me/requests/route.ts` создан Claude как эталон (`GET` только) и **запрещён правилом** в `opencode.json`:

```json
{ "action": "edit", "resource": "src/app/api/me/requests/route.ts", "effect": "deny" }
```

Тексты тикетов противоречат этому запрету: список/карточка — «эталон Claude», но создание/отмена/переписка/переотправка — моя задача, а Next.js требует, чтобы `POST` жил в этом же файле.

## Варианты

1. **(Рекомендуется)** Человек снимает `deny` для этого файла (или меняет на `ask`). Тикет DS-17 завершится одним коммитом: POST-хендлер (5 строк: `requireStudent` → `withIdempotency` → `parseJson(requestCreateBody)` → `createRequestForStudent` → `ok(..., 201)`) добавляется к эталону, GET не меняется.
2. Не трогать файл, а `POST` вынести в **отдельный** путь (например `POST /api/me/requests-create`) — нарушает контракт из DEEPSEEK-TASKS §4 и tests/security/manifest.ts.
3. Оставить DS-17 незакрытым до фазы C — очередь пополняется через `resubmit`/мок, демо-жюри увидит только сид-заявки.

## Предлагаю вариант 1

Код POST-обработчика уже написан (отчёт агента DS-17, готов к вставке, тесты `tests/integration/requests-actions.test.ts` — 17 сценариев, из них падают только те, что требуют маршрут). Нужен только доступ к файлу.

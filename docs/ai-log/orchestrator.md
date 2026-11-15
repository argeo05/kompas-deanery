# Оркестратор фазы C

| Этап     | Модель                             | Итог                                                                                                              | Длительность |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| C0       | opus (сам)                         | done: протокол, verify, MCP                                                                                       | ~5 мин       |
| C1       | sonnet                             | done: verify 812/812, e2e 20/20; хвост — исключить isDemo из лимита по логину (передан в C10)                     | 14 мин       |
| C2       | opus                               | done: verify 846 зелёный, e2e 49/49 (3 skip), axe 0; токены в tokens.css, свои Toast/Sheet под CSP                | 27 мин       |
| C3       | sonnet                             | done: verify 879, e2e+axe 137 зелёных; ⚠️ AC-3.4 (ручной импорт .ics), AC-2.4 → C7                                | 28 мин       |
| SPEC 1.3 | opus (worktree, параллельно C2–C3) | done: контраст 110/110, слито c13ef7f, D-008→D-009 при слиянии                                                    | 15 мин       |
| C3.5     | sonnet                             | done: синхронизация с SPEC 1.3, verify 881, e2e 137, axe 40/40; хвосты → C11 (контраст на линовке, просмотр 1440) | 14 мин       |

- C5 | sonnet | done: verify 957, e2e 227/7skip, axe 104; D-012; хвост: 1 разовое падение unit в verify (2 повторных прогона зелёные) | 28 мин
  | C6 | sonnet | done: verify 988, e2e+axe 265/7skip; D-013; демо-сброс → C8 | 26 мин |
  | C7 | opus | done: verify 1017, e2e+axe 295/7skip; D-014; SW Serwist; хвост: старый next-server на :3100 (e2e гонять с E2E_PORT=3101) | 28 мин |
  | C8 | sonnet | done: verify 1048, e2e+axe 337 (2 падения починены); D-015; не сделано: AC-1.8 (SHOULD), 3 замечания a11y | 29 мин |
  | C9 | sonnet | done: verify 1083, e2e+axe 511/7skip; D-016; детерминированный режим, флаг AI_ASSISTANT выключен; eval 12/15 на контроле | 17 мин |
  | C10 | sonnet | blocked: needs human — деплой-пакет готов (D-017), verify 1084; Lighthouse A11y 100, Perf <90 на /today /study /documents; e2e: 2 теста красные ночью из-за quiet hours | 9 мин |
  | C11 | opus/sonnet | ⚠️ done: Q-HE-1, Q-KLM-1…3 ✅; Q-HE-2 (16 находок сер.2 при цели ≤3) и Q-CW ❌; verify 1096, a11y 176; D-018, D-019; сер.3: 9→3→0 | 2 раунда |

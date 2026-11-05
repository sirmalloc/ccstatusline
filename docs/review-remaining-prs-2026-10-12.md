# Приёмка остальных 30 merged PR

Проверено 12 октября 2026 года. Репозиторий: `axisrow/ccstatusline`.
Исходный checkout: `ab73b236eb59fbb93046603d79c2f93e8c703329`.
Раннее ревью охватывало #56, #57, #54, #52, #50, #49, #48, #47, #44, #46.
Здесь перечислены все остальные 30 merged PR, отсортированные по времени merge.

Критерии восстановлены из описаний PR, исходных задач, затронутых callers и пользовательского поведения. Статусы относятся к текущему коду; отдельно отмечены ошибки на момент merge, исправленные последующими PR. «Выполнено» означает, что профильные критерии проверены перечисленными способами, а не что доказано отсутствие любых ошибок на всех платформах.

**Уточнённый итог: 24 PR выполняют проверенные профильные критерии, 6 выполняют их частично: #10, #11, #25, #26, #30, #33.** Найдено семь конкретных проблем; две относятся к #26. Исходный код не изменён.

**Поправка после чтения upstream [#716](https://github.com/sirmalloc/ccstatusline/issues/716).** Полный `bun test`, `claude-settings.test.ts` и профильные проверки, включавшие `render-parity.test.ts`, были запущены без внешнего sandbox HOME. Это ошибка выполнения проверки. Зелёные тесты не подтверждают их безопасность, а прежнее утверждение, что живые пользовательские settings не изменялись, отозвано. Сейчас выполнялись только read-only проверки; дополнительные небезопасные тесты не запускались. Обнаружен ещё один путь записи реального Claude settings из golden parity test: см. находку 7.

Для последующих запусков нужен отдельный test process, в котором HOME/USERPROFILE/CLAUDE_CONFIG_DIR и cache/config directories заданы до загрузки модулей; либо файловый sandbox, запрещающий запись в реальный пользовательский HOME. Одна временная ccstatusline config path не изолирует побочные записи hooks. `vitest.stryker.global-setup.ts` не защищает обычный `bun test`.

## Критерии и результат по каждому PR

| PR | Критерии приёмки | Выполнено | Не выполнено / предел проверки |
|---|---|---|---|
| [#45](https://github.com/axisrow/ccstatusline/pull/45), CLI smoke | Реальный subprocess и Git fixtures показывают no-git, divergence ↑/↓, отсутствие upstream и скрытый ноль; тест не зависит от живого конфига пользователя. | ✅ Все четыре сценария прошли. Проверены изоляция HOME, --config и payload.cwd. | Нет обнаруженного нарушения. |
| [#41](https://github.com/axisrow/ccstatusline/pull/41), null в lineThemes | Сохранённые TUI массивы с null принимаются схемой; null означает наследование; нормализация не ломает Powerline. | ✅ Schema/normalization/renderer tests прошли, включая null holes и hasOwnLineTheme. | Нет обнаруженного нарушения. |
| [#42](https://github.com/axisrow/ccstatusline/pull/42), emoji меню | В меню используется 🧶 с emoji presentation; подпись и навигация сохраняются. | ✅ Метка присутствует в коде и живом PTY-выводе Node 18; menu tests прошли. | Физическое отображение в разных терминалах и шрифтах не проверено. |
| [#40](https://github.com/axisrow/ccstatusline/pull/40), темы по строкам | Отдельная тема перекрывает глобальную; inherit/none работают; Powerline корректно начинает новую палитру; добавление/удаление/перемещение строк сохраняет привязку тем; старые конфиги сохраняют поведение. | ✅ Renderer, config, theme-index, App, LineSelector, picker и preview tests прошли. | На момент merge TUI сохранял непринимаемые null holes; это исправлено #41. |
| [#39](https://github.com/axisrow/ccstatusline/pull/39), остальные compact labels | Все перечисленные виджеты используют общий helper; global/per-widget/raw/custom-label семантика сохраняется; числовые и hideable режимы не меняются. | ✅ Профильные тесты и дополнительные прямые проверки десяти типов прошли; compaction text-mode использует тот же helper. | Preview maxWidth у SessionName остаётся ошибочным; первопричина в #10, см. находку 6. |
| [#38](https://github.com/axisrow/ccstatusline/pull/38), Session Clock | Compact даёт S:58m, выключенный режим сохраняет Session: 58m; raw и скрытие нуля работают. | ✅ SessionClock и shared-label tests прошли. | Нет обнаруженного нарушения. |
| [#37](https://github.com/axisrow/ccstatusline/pull/37), fork glyph | Fork отображает редактируемый ⑂; пустой glyph скрывает вывод; raw=true и not-fork состояния сохраняются. | ✅ Preview, fork, non-fork, hide-state и glyph override tests прошли; registry/editor wiring проверены. | Нет обнаруженного нарушения. |
| [#36](https://github.com/axisrow/ccstatusline/pull/36), ширина --serve | Следующий запрос видит новую ширину, включая TTL=0; memo сбрасывается на каждый запрос. | ✅ Регрессионный тест 80→120 прошёл; process dependency wiring проверен. | Проверка actual terminal resize основана на env override, не на смене физического TTY. |
| [#35](https://github.com/axisrow/ccstatusline/pull/35), NDJSON serve | Один процесс отвечает на несколько строк; invalid JSON/schema возвращают error и не убивают процесс; blank lines пропускаются; EOF завершает работу. | ✅ Тесты и реальные built subprocess в Bun, Node 25 и Node 18: valid→invalid→valid дали три ответа и exit 0. | Исходная memo-проблема ширины исправлена #36; один cwd/config остаётся оговорённой границей этого serve-прототипа. |
| [#34](https://github.com/axisrow/ccstatusline/pull/34), изоляция keychain tests | Write/mkdir пути замоканы; тест miss-marker проверяет запись, не трогая реальные пользовательские кеши. | ✅ Оба buffer-теста прошли; beforeEach и restore paths проверены. | Использованы синтетические credentials, реальные секреты не читались. |
| [#33](https://github.com/axisrow/ccstatusline/pull/33), build ref | Сборка сообщает фактический branch/SHA; диагностическая информация не превращает успешный build в ошибку при отсутствии git metadata. | ✅ С git-контекстом build завершился и вывел verify/settings-privacy@ab73b23. | ❌ Из исходного архива без .git bundle собран, но postbuild завершился с кодом 1. Находка 4. |
| [#32](https://github.com/axisrow/ccstatusline/pull/32), lint fix | Исправлены две ошибки; lint проходит без suppressions; поведение model conditions сохраняется. | ✅ Lint и model-condition tests прошли; diff не меняет логику. | Нет обнаруженного нарушения. |
| [#31](https://github.com/axisrow/ccstatusline/pull/31), compact expectations | Model/ContextBar тесты соответствуют glued presets и сохраняют проверки default/compact поведения. | ✅ Оба набора прошли; diff меняет только ожидания. | Нет обнаруженного нарушения. |
| [#30](https://github.com/axisrow/ccstatusline/pull/30), fish-style | ASCII single/slashed names сокращаются правильно; полный ref остаётся в URL; editor/preview отражают режим; Unicode не повреждается. | ✅ ASCII, editor/keybind и URL tests прошли. | ❌ Реальные 🚀feature/topic и 🚀worktree выводятся как �/topic и �. Находка 2. |
| [#29](https://github.com/axisrow/ccstatusline/pull/29), model conditions | CSV glob patterns, case-insensitive id/display_name, hide/show вместе и preview fallback работают; скрытые виджеты не исполняются, разделители схлопываются. | ✅ Renderer tests и дополнительные проверки overlapping rules и literal metacharacters прошли. | Две lint-ошибки после squash исправлены #32. |
| [#28](https://github.com/axisrow/ccstatusline/pull/28), turn number | Считаются реальные user prompts; tool-result/meta/sidechain/API-error исключаются; token mode остаётся default; используется общий scan. | ✅ Parser/widget tests прошли, включая mixed transcript, preview и отсутствие данных; дополнительного прохода в коде нет. | Нет обнаруженного нарушения. |
| [#27](https://github.com/axisrow/ccstatusline/pull/27), glued compact labels | Только compact presets теряют пробел; full/custom/raw формы сохраняют семантику; bar variants и Cost не получают двойной префикс. | ✅ Parameterized map, helper и renderer tests прошли. | Сразу после merge остались старые ожидания двух тестов; исправлены #31. |
| [#22](https://github.com/axisrow/ccstatusline/pull/22), negative keychain cache | Между fresh processes пустой scan кешируется 30 секунд; истечение возобновляет scan; credentials-file изменение видно сразу; запись best-effort. | ✅ Unit tests и mock-free process-проверка с PATH stub: число dump-keychain вызовов 1→1→2→2; появившийся credentials file немедленно прочитан. | Новый hashed login может ждать до 30 секунд: это явно оговорённое ограничение. Реальный Keychain не изменялся. |
| [#25](https://github.com/axisrow/ccstatusline/pull/25), request-scoped render | Render возвращает text; stdout/exit остаются в entrypoint; config/errors/width/usage/styling изолированы; golden parity и ≤+5% CPU regression подтверждены; tests не пишут пользовательские файлы. | ✅ Golden/config-isolation tests прошли. Две пары historical benchmark: 371.746→369.789 ms CPU/render, −0.53%; output hashes совпали. | ❌ Golden updatemessage test сохраняет временный config, но через syncWidgetHooks может переписать реальный Claude settings. HOME/CLAUDE_CONFIG_DIR в этом тесте не изолированы. Находка 7. |
| [#23](https://github.com/axisrow/ccstatusline/pull/23), runtime floor | Manifest/docs/build согласованы с Node ≥18; реальный Node 18 запускает bundled render; нет новой build dependency. | ✅ Официальный Node 18.0.0 arm64 проверен по SHA-256: pipe и --serve прошли; CLI с TTY отдаёт JSON; TUI отобразил главное меню. Build/docs/manifest согласованы. | Полное прохождение всех TUI экранов на Node 18 и штатный выход не подтверждены; PTY startup-проверка завершалась принудительно. CLI без TTY ломается независимо от runtime — #11. |
| [#26](https://github.com/axisrow/ccstatusline/pull/26), baseline harness | Работает матрица 1/10/36×cold/warm×small/large, отдельные count passes и variance repeats; CPU включает потомков; отчёт честно отражает failure и единицы измерения. | ✅ Self-test прошёл. В итоге выполнены все 26 сценариев, 1372 measured renders, по одному output hash на сценарий; latency/RSS/CPU/spawn fields сохранены. | ❌ Failed count-pass ломает report с KeyError вместо нормальной таблицы ошибок. ❌ CPU milliseconds подписаны как seconds. Находки 3 и 5. |
| [#21](https://github.com/axisrow/ccstatusline/pull/21), полный compact map | Все presets в map применяются; global/per-widget приоритет сохраняется; keybind не конфликтует; непомеченные labels не меняются. | ✅ Parameterized tests каждого map entry, capability/key reservation и renderer tests прошли. | Конкретные hardcoded labels закрываются последующими #38/#39, что соответствует scope follow-up. |
| [#13](https://github.com/axisrow/ccstatusline/pull/13), font fallback | PUA separators/caps превращаются в | при отсутствии font; обычные символы сохраняются; обнаруженный font сохраняет glyph; cache сбрасывается после install. | ✅ BMP/astral, regular/Powerline и cache-seam tests прошли; render callers используют общий helper. | Disk detection не знает реально выбранный terminal font; это документированная граница. |
| [#12](https://github.com/axisrow/ccstatusline/pull/12), regular themes | Palette работает на всех color levels; explicit widget colors выигрывают без сдвига slots; separator/merge/preserved ANSI работают; старые настройки сохраняются. | ✅ Regular theme и schema tests прошли, включая весь theme catalog на уровнях 1/2/3. | CLI set/get без TTY упирается в #11, а не в палитру. |
| [#11](https://github.com/axisrow/ccstatusline/pull/11), non-interactive CLI | get/set/widget add/remove/move/validate работают из automation; JSON/errors machine-readable; invalid config не перезаписывается; atomic/symlink/config semantics сохраняются. | ✅ Utility tests, validation, symlink и mutations прошли; реальные CLI с TTY работают в трёх runtime. | ❌ Без TTY get/validate вместо выполнения возвращают No input received и rc=1. Находка 1. |
| [#10](https://github.com/axisrow/ccstatusline/pull/10), compact toggles и caps | Global/per-widget override работают в обе стороны; defaults/migrations не меняются; raw/custom labels сохраняются; cwd/session-name caps одинаковы в preview и live. | ✅ Compact/schema/menu/keybind tests прошли; live width caps и cwd preview соблюдены. | ❌ SessionName preview при maxWidth=5 занимает 19 колонок; live занимает 5. Находка 6. |
| [#9](https://github.com/axisrow/ccstatusline/pull/9), cumulative dedup | Повторные blocks одного API call не суммируются; максимальный output учтён; streaming/sidechain/id-less/без duplicates сохраняют нужную семантику. | ✅ JSONL metrics tests прошли, включая все перечисленные границы и opt-in поведение. | Группировка опирается на consecutive message.id; произвольную перестановку строк не считаю гарантированной семантикой. |
| [#3](https://github.com/axisrow/ccstatusline/pull/3), lazy editors | Registry/piped render не инициализируют Ink/Yoga/WASM/fetch; editors открываются через lazy API; built output сохраняется; CPU win измерен. | ✅ Fresh-process startup и editor interaction tests прошли. Historical benchmark: CPU −18.69% Node / −14.25% Bun относительно #2, hashes идентичны. | Первое открытие editor может suspend; native BSD и полный matrix старых runtimes не проверены. |
| [#2](https://github.com/axisrow/ccstatusline/pull/2), startup cost | Один ps на ancestor с прежней глубиной/precedence; proxy import только при proxy; error/fallback сохраняются; perf и output измерены. | ✅ Terminal/proxy tests прошли. Historical benchmark: CPU −5.02% Node / −6.26% Bun, hashes идентичны. | Combined ps failure сужает fallback — документированный tradeoff. Универсальный −24% не подтверждён и не заявляется этим ревью. |
| [#1](https://github.com/axisrow/ccstatusline/pull/1), Tokens Last Turn | Последний main-chain API call учитывается один раз; streaming max/id-less/opt-in/raw/zero/format/preview работают; нет второго scan. | ✅ Parser/widget tests прошли; registry/types/exports и shared scan wiring проверены. | Исходный cumulative overcount был вне scope и позднее исправлен #9. |

## Конкретные проблемы

1. **CLI требует TTY, хотя предназначен для automation (#11).**
   `isCliMode` в `src/utils/cli.ts:668` возвращает `isTty && args.length > 0`.
   Реальный `get --json` с пустым non-TTY stdin в Bun 1.3.13, Node 25.9.0 и Node 18.0.0 вернул rc=1, stderr `No input received`, пустой stdout. С теми же argv и TTY все три вернули rc=0 и JSON.
   Минимальное направление исправления: распознавать явные CLI subcommands независимо от наличия TTY, сохраняя обычный piped render без subcommand. Добавить process-test с DEVNULL stdin.

2. **Fish-style повреждает Unicode (#30).**
   `src/widgets/GitBranch.ts:176` и `src/widgets/GitWorktree.ts:91` используют `[0]`, выделяя половину UTF-16 surrogate pair.
   В реальном Git worktree branch `🚀feature/topic` и worktree `🚀worktree` дали `�/topic | �`.
   Минимальное исправление: брать первый Unicode grapheme, а не первый UTF-16 code unit; проверить обе ветки на emoji и combining sequence.

3. **Baseline report падает на failed count-pass (#26).**
   `scripts/benchmark-render.py:768` безусловно читает `spawn_counts_per_render` у error-row, где этого поля нет.
   После реального load-gate rejection сбор 23 строк сохранился в JSON, но генерация MD упала с `KeyError('spawn_counts_per_render')`. Повторено отдельным deterministic input с одной successful row и одной failed count-pass row. Та же ошибка присутствует в original merge #26.
   Минимальное исправление: successful count rows фильтровать отдельно; error rows отправлять в уже имеющуюся секцию failures.

4. **Build ref ломает source archive build (#33).**
   `scripts/replace-version.ts:45` без fallback выполняет `git rev-parse`.
   В `git archive HEAD` bundle и version replacement успешны, затем postbuild rc=1. С предоставленным git-контекстом тот же build rc=0 и правильный ref.
   Минимальное исправление: git metadata сделать best-effort; отсутствие .git не должно отменять успешную сборку.

5. **В baseline report неверные единицы (#26).**
   Заголовки `scripts/benchmark-render.py:736` и `:777` говорят `CPU s/render`, но ячейки `:745` и `:780` берут `cpu_per_render_ms`.
   Например, 278.44 — это ms/render, а не s/render. Читатель получает ошибку масштаба ×1000.
   Минимальное исправление: назвать колонку `CPU ms/render`, включая сохранённые таблицы документации.

6. **SessionName preview игнорирует width cap (#10, виден также рядом с #39).**
   `src/widgets/SessionName.ts:49` возвращает label+sample без `applyMaxWidth`, который используется в live ветке `:60`.
   Проверка через реальный renderer: maxWidth=5 → preview `Session: my-session`, width=19; live width=5. CurrentWorkingDir в обоих режимах выдаёт width=5.
   Минимальное исправление: одинаково применить `applyMaxWidth` к preview; тестировать cap меньше sample, а не maxWidth=20 для строки длиной 12.

7. **Golden parity test может переписать настоящий Claude settings (#25).**
   `src/__tests__/render-parity.test.ts` создаёт временный config и мокает cwd, но не HOME/CLAUDE_CONFIG_DIR. Updatemessage test проходит через `src/render.ts:275` → `saveSettingsTo` → `src/utils/config.ts:288` → `syncWidgetHooks` → `saveClaudeSettings`.
   Hook sync использует process environment, а не invocation.env; временный config path не изолирует этот side effect. Само выполнение теста для воспроизведения больше не повторялось.
   Read-only проверка показала mtime настоящего `~/.claude/settings.json` 2026-10-12T10:48:44.458941Z, совпадающий с периодом профильного прогона. Файл валиден, содержит 24 верхнеуровневых ключа; backup .bak побайтно совпадает с текущим файлом. Перед тестом контрольной копии не было, поэтому отсутствие потери изменений не доказано. Настоящий ccstatusline config имеет mtime 07:17:51Z, до этих проверок.
   Минимальное исправление теста: внешняя изоляция HOME/USERPROFILE/CLAUDE_CONFIG_DIR до import, проверка отсутствия записей вне test directory. Изоляция production hook sync требует отдельного исправления request-scoped env, а не только изменения test expectations.

## Проверки и воспроизводимость

- 268 тестов в 16 профильных файлах: CLI/Git smoke, serve, golden parity, startup, themes, model conditions, JSONL, compact helper, Git/SessionClock/LastTurn widgets; 0 failures.
- 382 теста в 21 файле: config/CLI, terminal, keychain/proxy, widget capabilities, App/menus/themes/preview и lazy editor interactions; 0 failures.
- `bun run lint`: exit 0. Во время предыдущего ревью того же HEAD полный suite имел 3581 pass / 1 skip / 1 fail (Git LFS на macOS). Этот общий сбой не выдаётся за ошибку каждого из этих 30 PR.
- Built NDJSON subprocess: Bun, Node 25.9.0, настоящий Node 18.0.0; все три survived invalid middle input и завершились по EOF.
- Node 18 взят из nodejs.org/dist/v18.0.0, tarball SHA-256 совпал с официальным SHASUMS256.txt. Проверен startup bundled TUI, но не доказан штатный выход всех TUI сценариев.
- Исторические snapshots: до #2, merge #2, merge #3, до #25, merge #25. Собраны с общими текущими dependencies (node_modules), поэтому это воспроизведение code-change comparison, не восстановление всех исторических lockfile environments.
- Performance: 10 batches ×80 renders = 800 measured fresh processes на synthetic 13,009,445-byte transcript; CPU включает reaped children. Каждый batch имел один и тот же hash `454f8606b708708a4afd72598c1493889cacba100fc86da1f418f1977c044f86`.
- N-session baseline: все 26 строк выполнены, 1372 measured renders. Первые 23 успешны, три отклонены gate при loadavg 73.6>64; после снижения нагрузки эти три повторены отдельно. Исходный JSON и ошибка отчёта сохранены; successful combined JSON записан отдельно. Gate 64 выбран для проверки harness на занятом хосте, это не тихий acceptance benchmark с исходным gate 10.
- В отдельной process-проверке Keychain использован PATH stub и isolated HOME: доказаны miss-cache reuse/expiry/credentials-file override. Это не гарантия изоляции остальных test suites; прежнее утверждение об отсутствии изменений живых settings отозвано после #716.

Артефакты этой проверки: `/tmp/ccsl-other-prs-i421p6l0/`.
Профильные логи: `/tmp/ccstatusline-remaining-targeted.log`, `/tmp/ccstatusline-remaining-tui-config.log`.
JSON reproductions: `cli-tty-repro.json`, `unicode-fish-repro.json`, `keychain-negative-cache.json` внутри папки артефактов.
Дополнительные assertions: `/tmp/ccstatusline-remaining-probes.ts`; вывод — `supplemental-probes.log`.
Baseline результаты: `baseline-26/baseline.json` (исходный failed report run), `baseline-26/baseline-completed.json` (26 successful rows), `baseline-26/BASELINE.md`.

Не проверены нативные Windows/Linux/BSD запуски, физические terminal fonts, все TUI экраны на Node 18 и точные исторические dependency installations. Числа performance зависят от нагрузки хоста. Исходный код не исправлялся; семь перечисленных нарушений остаются. Пользовательские settings не восстанавливались: текущая .orig содержит прежний statusLine command с удалённым Stryker sandbox, поэтому автоматическое восстановление из неё было бы небезопасно.

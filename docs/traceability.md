# Матриця трасовності

Модель: `model/CncMachineTwin.sysml` (SysML v2), пакети `Traceability` (зв’язки **satisfy**) і `Verification` (зв’язки **verify** у `verification def`). Блоки — ті самі, що в стовпці «Блок SysML» `iso23247-mapping.md` і на `diagrams/components.mmd`.

| Вимога | Елемент архітектури (блок, satisfy) | Перевірка (verification def, verify) | Коли |
|---|---|---|---|
| FR-01 | Граничний шлюз: збирання даних (`edge.collection : DataCollection`) | `SignalCollectionTest` — 30-хв прогін з емулятором ЧПК і DAQ: 13 сигналів, частоти й мітки часу відповідають реєстру | ЛР 2 |
| FR-02 | Обчислення ознак вібрації (`edge.featureExtractor : FeatureExtractor`) | `FeatureComparisonTest` — ознаки шлюзу порівнюються з еталонним розрахунком numpy на записаному сигналі, відхилення < 1 % | ЛР 2 |
| FR-03 | Веб-панель (`ui : OperatorUi`) | `LiveViewAcceptanceTest` — сценарій приймання з оператором: усі поля панелі присутні й оновлюються | ЛР 4 |
| FR-04 | Служба аналітики (`analytics : AnalyticsService`) | `ChatterInjectionTest` — відтворення запису з автоколиваннями та перевантаженням, перевірка появи сповіщень | ЛР 4 |
| FR-05 | Служба аналітики (`analytics : AnalyticsService`) | `ToolWearReplayTest` — прогін історії інструмента до 80 % ресурсу, перевірка попередження | ЛР 4 |
| FR-06 | Сховище часових рядів (`tsdb : TimeSeriesStore`) | `HistoryQueryTest` — запити за інтервалом, тренди, вивантаження CSV | ЛР 2 |
| FR-07 | Модуль валідації відліків (`dataQuality : DataQuality`) | `DataQualityRulesTest` — модульні тести правил якості на синтетичних аномаліях | ЛР 2 |
| FR-08 | Служба аналітики формує звіт (`analytics : AnalyticsService`), адаптер MES передає показники (`mes : MesAdapter`) | `ShiftReportFormatTest` — перевірка формату звіту й обміну з MES-заглушкою | ЛР 4 |
| NFR-01 | Служба синхронізації стану (`sync : SyncService`) | `SyncLatencyMeasurement` — мітки джерела та API, 30 хв, p95 ≤ 200 мс | ЛР 2 |
| NFR-02 | Twin API, маршрут «датчик — подання» (`api : TwinApi`) | `EndToEndComparativeRun` — порівняльний прогін Г-01 (опитування / push), медіана й p95 ≤ 500 мс | ЛР 4 |
| NFR-03 | Брокер телеметрії, масштабування (`broker : TelemetryBroker`) | `LoadTest` — навантажувальний прогін 1 і 10 емуляторів верстатів, зростання p95 ≤ 30 % | ЛР 2 |
| NFR-04 | Сховище часових рядів і політика зберігання (`tsdb : TimeSeriesStore`), архів сирих даних (`archive : RawArchive`) | `StorageGrowthTest` — 7-денний прогін, фактичний розмір БД, екстраполяція ≤ 100 ГБ/рік | ЛР 2 |
| NFR-05 | Буфер на шлюзі (`edge.buffer : EdgeBuffer`) | `OutageInjectionTest` — відключення мережі на 15 хв, кількість відліків до й після | ЛР 2 |
| NFR-06 | Служба ідентифікації та доступу (`security : SecurityService`) | `SecurityScanTest` — nmap, перевірка конфігурацій TLS/OPC UA, тест доступу кожною роллю | ЛР 3 |

Шлях до блоку в моделі: `context.platform.<…>`, наприклад `satisfy DCE_DataCollection::collectSignals by context.platform.edge.collection;`.

## Покриття

Загальна кількість вимог |R| = 14 (8 FR + 6 NFR). Кожна має щонайменше один зв’язок satisfy (|R_т| = 14; FR-08 і NFR-04 — по два) і одну перевірку verify (|R_в| = 14):

```
C_т = |R_т| / |R| · 100 % = 14 / 14 · 100 % = 100 %
C_в = |R_в| / |R| · 100 % = 14 / 14 · 100 % = 100 %,   C_в ≤ C_т — виконано
```

Порожніх клітинок немає. Обчислення повторюється автоматично з тексту моделі, із перевіркою, що ідентифікатори в `requirements.md`, моделі й цій матриці збігаються:

```
python3 model/trace_check.py
```

```
Вимога   Блок (satisfy)                                    Перевірка (verify)
FR-01    context.platform.edge.collection                  SignalCollectionTest
FR-02    context.platform.edge.featureExtractor            FeatureComparisonTest
FR-03    context.platform.ui                               LiveViewAcceptanceTest
FR-04    context.platform.analytics                        ChatterInjectionTest
FR-05    context.platform.analytics                        ToolWearReplayTest
FR-06    context.platform.tsdb                             HistoryQueryTest
FR-07    context.platform.dataQuality                      DataQualityRulesTest
FR-08    context.platform.analytics, context.platform.mes  ShiftReportFormatTest
NFR-01   context.platform.sync                             SyncLatencyMeasurement
NFR-02   context.platform.api                              EndToEndComparativeRun
NFR-03   context.platform.broker                           LoadTest
NFR-04   context.platform.tsdb, context.platform.archive   StorageGrowthTest
NFR-05   context.platform.edge.buffer                      OutageInjectionTest
NFR-06   context.platform.security                         SecurityScanTest

|R| = 14;  |R_т| = 14;  |R_в| = 14
C_т = 14/14 · 100 % = 100%
C_в = 14/14 · 100 % = 100%

Узгодженість: OK — ідентифікатори збігаються в усіх трьох місцях
```

## Зауваги

- Покриття трасами C_т (5) і покриття еталонної моделі C (3) — різні показники: C_т = 100 % означає, що кожна *обіцяна* вимога має втілення й перевірку; C = 88,9 % (`iso23247-mapping.md`) показує, що один *клас* функцій (керування пристроями) свідомо не реалізовано.
- Ланцюжок «вимога → блок → перевірка → результат вимірювання» утворює цифрову нитку (digital thread) платформи: у ЛР 2–4 результати перевірок дописуватимуться до цієї матриці.

## Результати перевірок ЛР 2

Для вимог, перевірку яких у ЛР 1 заплановано на ЛР 2, вписано фактичний результат стенда ЛР 2 (Eclipse Ditto 3.9.7, емульовані датчики). Таблицю заповнено з `results/` після прогону.

<!-- AUTO:trace_lr2 -->
| Вимога | Перевірка ЛР 1 | Результат ЛР 2 | Статус |
|---|---|---|---|
| FR-01 | SignalCollectionTest | 13 сигналів реєстру, NC-програму й лічильник деталей відображено в модель (22 властивості стану); повнота історії 300 (100.0%), розбіжність значень 0 | виконано на емуляторі |
| FR-02 | FeatureComparisonTest | ознаки вібрації на стенді генерує емулятор, сирого сигналу 5 кГц немає — порівняння з еталоном numpy неможливе | перенесено в ЛР 4 |
| FR-06 | HistoryQueryTest | історія в InfluxDB (7 діб, 10 Гц), запити за інтервалом виконують `consistency.py` і `analyze.py`, тренди — панель Grafana | виконано |
| FR-07 | DataQualityRulesTest | валідація за моделлю WoT: відхилено 5 з 5 невалідних змін (`information-model.md`); навмисна помилка відображення — втрачено 192 [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]. Перевірки монотонності міток і «завмерлих» значень ще не реалізовано | частково |
| NFR-01 | SyncLatencyMeasurement | p50 / p95 при 10 оновленнях/с: 12 / 17 (ціль ≤ 200: виконано) (300 повідомлень; ЛР 1 планувала 30 хв — довший прогін у ЛР 4; ділянки L1 + L2 ≈ 100 мс з `latency.md` у вимірювання не входять) | виконано |
| NFR-03 | LoadTest | один двійник при 100 оновленнях/с (= сумарна частота 10 верстатів): p95 = 67 мс; тест з 10 окремими двійниками не виконувався | частково (оцінка зверху) |
| NFR-04 | StorageGrowthTest | розрахунок за формулою (2): ≈ 4,4 ГБ на верстат на рік на стенді, ≈ 7,9 ГБ у конфігурації ADR-0001 (`information-model.md`); 7-денного прогону не було | розрахунком |
| NFR-05 | OutageInjectionTest | емулятор не має буфера граничного шлюзу; QoS 1 і сеанс брокера захищають лише ділянку брокер → Ditto | перенесено в ЛР 4 |
<!-- /AUTO:trace_lr2 -->

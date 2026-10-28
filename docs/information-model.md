# Інформаційна модель та онтологія двійника обробного центру з ЧПК

ЛР 2, заняття 2. Вхідні дані — реєстр сигналів S01–S13 з `docs/requirements.md` (ЛР 1).

## Відповідність реєстру сигналів

Двійник зберігає **стан**, а не сирі потоки. Граничний шлюз (ADR-0003 ЛР 1) раз на 100 мс формує одне повідомлення зі станом верстата, тож **двійник оновлюється з частотою 10 Гц**. Для кожного сигналу правило зведення до 10 Гц таке:

| Сигнал ЛР 1 | f_д на джерелі | Елемент моделі (feature/властивість) | Тип | Одиниця (QUDT) | Діапазон | f у двійнику | Зведення на периферії |
|---|---|---|---|---|---|---|---|
| S01 Вібрація шпинделя | 5000 Гц | `vibration/rms`, `peak`, `crestFactor`, `kurtosis`, `band1…band4` | number | g (`qudt:G`); безрозмірні; g² | 0…50; 1…20; 0…50; 0…100 | 10 Гц | 8 ознак у вікні 512 відліків (FR-02) |
| S02 Навантаження шпинделя | 25 Гц | `spindle/load` | number | % (`qudt:PERCENT`) | 0…150 | 10 Гц | максимум за 100 мс (піки важливі для перевантаження) |
| S03 Оберти шпинделя | 5 Гц | `spindle/speed` | number | об/хв (`qudt:REV-PER-MIN`) | 0…12 000 | 10 Гц | останнє значення (повтор) |
| S04 Положення X | 10 Гц | `axes/positionX` | number | мм (`qudt:MilliM`) | 0…762 | 10 Гц | без зведення |
| S05 Положення Y | 10 Гц | `axes/positionY` | number | мм | 0…406 | 10 Гц | без зведення |
| S06 Положення Z | 10 Гц | `axes/positionZ` | number | мм | 0…508 | 10 Гц | без зведення |
| S07 Подача | 5 Гц | `axes/feedRate` | number | мм/хв (`qudt:MilliM-PER-MIN`) | 0…25 000 | 10 Гц | останнє значення |
| S08 Струм приводу X | 25 Гц | `axes/currentX` | number | А (`qudt:A`) | 0…30 | 10 Гц | максимум за 100 мс |
| S09 Температура підшипників | 0,1 Гц | `spindle/bearingTemperature` | number | °C (`qudt:DEG_C`) | 10…80 | 10 Гц | останнє значення (зміна раз на 10 с) |
| S10 Температура МОР | 0,1 Гц | `status/coolantTemperature` | number | °C | 10…50 | 10 Гц | останнє значення |
| S11 Режим ЧПК | за зміною | `status/mode` | string, enum | — | OFF, IDLE, RUN, FEED_HOLD, TOOL_CHANGE, ALARM, E_STOP | 10 Гц | поточне значення |
| S12 Номер інструмента | за зміною | `status/toolNumber` | integer | — | 0…24 | 10 Гц | поточне значення |
| S13 Код аварії | за зміною | `status/alarmCode` | integer | — | 0…65 535 | 10 Гц | поточне значення, 0 — немає |
| — NC-програма (FR-01) | за зміною | `status/program` | string | — | до 64 символів | 10 Гц | поточне значення (атрибут ЧПК) |
| — Лічильник деталей (FR-01) | за зміною | `status/partCount` | integer | шт. | 0…999 999 | 10 Гц | поточне значення (атрибут ЧПК) |
| — (службові) | — | `sync/seq`, `sync/ts` | integer | —; мс UTC | ≥ 0 | 10 Гц | номер повідомлення й час відліку на шлюзі (NFR-01) |

Разом у стані 22 значення (20 із сигналів реєстру + NC-програма й лічильник деталей, яких вимагає FR-01 ЛР 1) і 2 службові — у п’яти функціональних блоках: `axes`, `spindle`, `vibration`, `status`, `sync`. Порівняно з табл. 2 інструкції додано блок `status` (режим, інструмент, аварія, програма, лічильник, МОР): ці величини віддає система ЧПК, вони не належать ні осям, ні шпинделю.

**Моделі типу** (каталог `twin/`, версія входить до назви файлу):

| Файл | Що описує | `@type` (клас онтології) |
|---|---|---|
| `cnc-machine-1.0.0.tm.jsonld` | паспорт (9 властивостей верхнього рівня → атрибути), склад (5 підмоделей), дві дії | `cnc:MachiningCenter` |
| `axes-1.0.0.tm.jsonld` | положення X/Y/Z, подача, струм X | `cnc:FeedAxes`; властивості `cnc:AxisPosition`, `cnc:FeedRate`, `cnc:MotorCurrent` |
| `spindle-1.0.0.tm.jsonld` | оберти, навантаження, температура підшипників | `cnc:Spindle`; `cnc:SpindleSpeed`, `cnc:SpindleLoad`, `cnc:BearingTemperature` |
| `vibration-1.0.0.tm.jsonld` | 8 ознак вібрації, які обчислює модуль DAQ | `cnc:VibrationDaq`; `cnc:VibrationRms`, `VibrationPeak`, `CrestFactor`, `Kurtosis`, `BandEnergy` |
| `status-1.0.0.tm.jsonld` | режим (enum), інструмент, аварія, NC-програма, лічильник деталей, МОР | `cnc:CncController`; `cnc:OperatingMode`, `ToolNumber`, `AlarmCode`, `NcProgram`, `PartCount`, `CoolantTemperature` |
| `sync-1.0.0.tm.jsonld` | `seq`, `ts` | — (службова) |

Кожна підмодель (`tm:submodel`, функціональний блок Ditto) — складова частина верстата, клас-нащадок `Asset`, пов’язаний з верстатом через `hasPart` (табл. 1 інструкції): осі подачі, шпиндель, модуль DAQ вібрації, система ЧПК. Величини, які ці частини віддають, — класи-нащадки `ObservableProperty` у `@type` властивостей. Тому `@type` блоку `vibration` — модуль `VibrationDaq`, а не сама вібрація.

Кожна властивість стану має `default` у межах діапазону: для температур (від 10 °C) і пік-фактора (від 1) значення 0 було б поза моделлю, тож каркас примірника отримує 20 °C і 1 відповідно. Моделі доступні за адресою <http://localhost:8090/twin/cnc-machine-1.0.0.tm.jsonld>.

**Тип і примірник.** Тип — файли `*.tm.jsonld`: склад, типи даних, одиниці, діапазони, дії; спільні для всіх верстатів цієї моделі. Примірник — двійник `org.pzks:cnc-1` (`twin/cnc-1.json`): посилання на тип (`definition`), політика й конкретні паспортні значення (заводський номер `VMC-2023-0815`, дільниця `org.pzks:cell-1`), а значення стану записує телеметрія. Це вісь «тип — екземпляр» RAMI 4.0.

## Словник понять

Онтологія: `twin/ontology.ttl`, IRI `http://example.org/cnc`, префікс `cnc:` збігається з префіксом у моделях TM.

| № | Поняття | Означення | Онтологія | Відповідник на платформі |
|---|---|---|---|---|
| 1 | Актив | фізичний виробничий елемент (OME ISO 23247) | клас `Asset` | двійник (thing) або функціональний блок |
| 2 | Дільниця механообробки | виробнича одиниця, що містить верстати | клас `ProductionCell` ⊑ `Asset` | двійник `org.pzks:cell-1` |
| 3 | Обробний центр з ЧПК | верстат — об’єкт двійника | клас `MachiningCenter` ⊑ `Asset` | `definition` = `cnc-machine-1.0.0.tm.jsonld`, двійник `org.pzks:cnc-1` |
| 4 | Шпиндель | вузол, що обертає інструмент | клас `Spindle` ⊑ `Asset` | feature `spindle` |
| 5 | Осі подачі | вузли переміщення X/Y/Z | клас `FeedAxes` ⊑ `Asset` | feature `axes` |
| 6 | Ріжучий інструмент | витратний актив у шпинделі | клас `CuttingTool` ⊑ `Asset`; `usesTool` (функціональна) | `status/toolNumber` |
| 7 | Датчик | засіб вимірювання | клас `Sensor` (підкласи `Accelerometer`, `TemperatureSensor`, `PositionEncoder`, `CurrentSensor`, `VirtualSensor`) | джерело сигналу реєстру |
| 8 | Спостережувана величина | фізична величина, що вимірюється | клас `ObservableProperty` і підкласи (= `@type` властивостей TM) | властивість feature |
| 9 | Ознаки вібрації | статистики сирого сигналу S01, які обчислює модуль DAQ | `SpindleVibration` і підкласи `VibrationRms`, `VibrationPeak`, `CrestFactor`, `Kurtosis`, `BandEnergy`; модуль — `VibrationDaq` ⊑ `Asset` | властивості feature `vibration`; сам блок — `VibrationDaq` |
| 10 | Режим роботи ЧПК | дискретний стан верстата | клас `OperatingMode` ⊑ `MachineStatus`; блок `status` — `CncController` ⊑ `Asset` | `status/mode` (enum) |
| 11 | Є частиною / має частину | відношення складу, транзитивне | `partOf` ↔ `hasPart` (`owl:inverseOf`, `owl:TransitiveProperty`) | атрибут `cell` (thingId); підмоделі `tm:submodel` |
| 12 | Має датчик | актив оснащено датчиком | `hasSensor` (Asset → Sensor) | — (у Ditto не моделюється) |
| 13 | Спостерігає | датчик вимірює величину | `observes` (Sensor → ObservableProperty) | `signalId` → ідентифікатор реєстру |
| 14 | Заводський номер | ідентифікатор активу | `serialNo` (функціональна, xsd:string) | `attributes/serialNo` |
| 15 | Частота опитування | частота дискретизації датчика, Гц | `samplingRate` (xsd:decimal) | реєстр сигналів ЛР 1 |
| 16 | Ідентифікатор двійника | зв’язок індивіда онтології з двійником | `thingId` | `thingId` Ditto |
| 17 | NC-програма, лічильник деталей | атрибути ЧПК, що змінюються за подією (FR-01) | класи `NcProgram`, `PartCount` ⊑ `MachineStatus` | `status/program`, `status/partCount` |

Аксіоми, які перевіряє міркувач: `Asset`, `Sensor`, `ObservableProperty` попарно неперетинні (`owl:AllDisjointClasses`); підкласи активів теж неперетинні між собою; області визначення й значень у всіх властивостей-зв’язків; `usesTool` функціональна (в шпинделі один інструмент).

Схема — `docs/diagrams/ontology.mmd` / `ontology.svg`.

### Перевірка міркувачем HermiT

Онтологію відкрито в Protégé 5.6 (`File → Open → twin/ontology.ttl`), `Reasoner → HermiT → Start reasoner`. Ті самі перевірки виконано HermiT програмно (бібліотека owlready2 0.51 із вбудованим HermiT — той самий міркувач, що в Protégé), результат:

| Перевірка | Результат |
|---|---|
| Узгодженість онтології (259 трійок, 20 індивідів) | узгоджена, помилок немає |
| Виведений зворотний зв’язок | `cnc-1 partOf cell-1` (задано лише `cell-1 hasPart cnc-1`) |
| Транзитивність | `spindle-1 partOf cnc-1, cell-1`; `cell-1 hasPart` виводить також `spindle-1`, `axes-1`, `controller-1`, `coolant-1`, `daq-1` |
| Навмисна помилка 1: акселерометру `acc-1` додано тип `MachiningCenter` | **суперечлива** — `Asset` і `Sensor` не перетинаються; твердження видалено |
| Навмисна помилка 2: `spindle-1 usesTool cnc-1` | **суперечлива** — областю значень `usesTool` є `CuttingTool`, а `cnc-1` — `MachiningCenter`, неперетинний з ним |
| Класи онтології ↔ `@type` у моделях TM | усі 22 значення `cnc:*` у `twin/*.tm.jsonld` мають однойменні класи |

## Перевірка валідності

Опис примірника створено командами (`policy.json`, потім `cnc-1.json`):

```
API=http://localhost:8080/api/2
curl -u ditto:ditto -X PUT -H "Content-Type: application/json" --data @twin/policy.json $API/policies/org.pzks:cnc-1
curl -u ditto:ditto -X PUT -H "Content-Type: application/json" --data @twin/cnc-1.json $API/things/org.pzks:cnc-1
```

Каркас, який Ditto побудувала з моделі (функціональні блоки `axes`, `spindle`, `vibration`, `status`, `sync` зі значеннями `default`):

<!-- AUTO:model_create -->
```json
{
  "thingId": "org.pzks:cnc-1",
  "policyId": "org.pzks:cnc-1",
  "definition": "http://web/twin/cnc-machine-1.0.0.tm.jsonld",
  "attributes": {
    "manufacturer": "Верстатобудівний завод",
    "model": "VMC-850",
    "serialNo": "VMC-2023-0815",
    "controller": "SINUMERIK 828D",
    "maxSpindleSpeed": 12000,
    "travelX": 762,
    "travelY": 406,
    "travelZ": 508,
    "cell": "org.pzks:cell-1"
  },
  "features": {
    "axes": {
      "definition": [
        "http://web/twin/axes-1.0.0.tm.jsonld"
      ],
      "properties": {
        "positionX": 0,
        "positionY": 0,
        "positionZ": 0,
        "feedRate": 0,
        "currentX": 0
      }
    },
    "spindle": {
      "definition": [
        "http://web/twin/spindle-1.0.0.tm.jsonld"
      ],
      "properties": {
        "speed": 0,
        "load": 0,
        "bearingTemperature": 20
      }
    },
    "vibration": {
      "definition": [
        "http://web/twin/vibration-1.0.0.tm.jsonld"
      ],
      "properties": {
        "rms": 0,
        "peak": 0,
        "crestFactor": 1,
        "kurtosis": 0,
        "band1": 0,
        "band2": 0,
        "band3": 0,
        "band4": 0
      }
    },
    "status": {
      "definition": [
        "http://web/twin/status-1.0.0.tm.jsonld"
      ],
      "properties": {
        "mode": "OFF",
        "toolNumber": 0,
… (ще 17 рядків, повністю — results/api/model_create.txt)
```
<!-- /AUTO:model_create -->

Зміни стану через API (`P=$API/things/org.pzks:cnc-1/features`):

| № | Зміна | Чому | Очікувано | Фактично |
|---|---|---|---|---|
| 0 | `PUT $P/spindle/properties/load` ← `55.0` | у діапазоні 0…150 | 204 | <!-- AUTO:v0 -->**204**<!-- /AUTO:v0 --> |
| 1 | `PUT $P/spindle/properties/load` ← `200` | поза `maximum` 150 | 400 | <!-- AUTO:v1 -->**400**<!-- /AUTO:v1 --> |
| 2 | `PUT $P/axes/properties/positionX` ← `900` | поза ходом осі X 762 мм | 400 | <!-- AUTO:v2 -->**400**<!-- /AUTO:v2 --> |
| 3 | `PUT $P/status/properties/mode` ← `"MAINTENANCE"` | немає в `enum` | 400 | <!-- AUTO:v3 -->**400**<!-- /AUTO:v3 --> |
| 4 | `PUT $P/status/properties/toolNumber` ← `7.5` | `type: integer` | 400 | <!-- AUTO:v4 -->**400**<!-- /AUTO:v4 --> |
| 5 | `PUT $P/spindle/properties/rpm` ← `8000` | властивості `rpm` немає в моделі | 400 | <!-- AUTO:v5 -->**400**<!-- /AUTO:v5 --> |

Текст помилки (зміна 1):

<!-- AUTO:invalid_text -->
```json
{
  "status": 400,
  "error": "wot:payload.validation.error",
  "message": "The provided payload did not conform to the specified WoT (Web of Things) model.",
  "description": "The Feature <spindle>'s property </load> contained validation errors, check the validation details.",
  "validationDetails": {
    "/features/spindle/properties/load": [
      ": {maximum=must have a maximum value of 150}"
    ]
  }
}
```
<!-- /AUTO:invalid_text -->

Опис двійника (Thing Description), який Ditto згенерувала з моделі (`Accept: application/td+json`), початок:

<!-- AUTO:td -->
```json
{
  "@context": [
    "https://www.w3.org/2022/wot/td/v1.1",
    {
      "qudt": "http://qudt.org/vocab/unit/",
      "cnc": "http://example.org/cnc#"
    }
  ],
  "title": "Вертикально-фрезерний обробний центр з ЧПК",
  "description": "Тип об’єкта ЛР 1–2, варіант 3. Сигнали реєстру S01–S13 агреговано шлюзом до стану з частотою 10 Гц.",
  "@type": [
    "Thing",
    "cnc:MachiningCenter"
  ],
  "id": "urn:org.pzks:cnc-1",
  "base": "http://localhost:8080/api/2/things/org.pzks:cnc-1/",
  "version": {
    "model": "1.0.0",
    "instance": "1.0.0"
  },
  "links": [
    {
      "rel": "type",
      "href": "http://web/twin/cnc-machine-1.0.0.tm.jsonld",
      "type": "application/tm+json"
    },
    {
      "rel": "item",
      "type": "application/td+json",
      "href": "features/axes"
    },
    {
      "rel": "item",
      "type": "application/td+json",
      "href": "features/spindle"
    },
    {
      "rel": "item",
      "type": "application/td+json",
      "href": "features/vibration"
    },
    {
      "rel": "item",
      "type": "application/td+json",
      "href": "features/status"
… (ще 526 рядків, повністю — results/api/td.txt)
```
<!-- /AUTO:td -->

Позначка `readOnly` у паспортних властивостях запису **не забороняє** — права визначає політика: власник `nginx:ditto` може змінити `attributes/serialNo`, а суб’єкт з’єднання `integration:telemetry` — ні, бо має лише `WRITE` на `thing:/features`.

## Рівні зберігання

Формула (2): V = T · Σ s_i · f_i, розмір відліку 8 Б, у стані 22 величини, двійник оновлюється з частотою 10 Гц.

| Рівень | Що і де | Роздільність | Строк | Обсяг |
|---|---|---|---|---|
| Периферія | граничний шлюз: буфер станів 10 Гц (ознаки й повільні сигнали) на випадок розриву зв’язку (NFR-05, ADR-0003); сира вібрація не буферизується — NFR-05 її не покриває | повна | 15 хв | 1,6 МБ |
| Гарячий | поточний стан у Ditto + усі стани 10 Гц у InfluxDB (кошик `twin`) | 10 Гц | 7 діб (`DOCKER_INFLUXDB_INIT_RETENTION: 7d`) | **1 064,4 МБ** |
| Теплий | похвилинні мін./сер./макс. 20 величин; температури S09, S10 — повна роздільність 0,1 Гц (NFR-04) | 1 хв / 10 с | 1 рік | **302,7 МБ** |
| Холодний | архів сирої вібрації лише під час різання (ADR-0001 ЛР 1) + знімки ±30 с навколо подій автоколивань | 5 кГц | 7 діб / 1 рік | 2,42 ГБ + 0,60 ГБ ≈ 3,0 ГБ |

Розрахунки:

```
Периферія:  900 · 22 · 8 · 10            =     1 584 000 Б ≈ 1,6 МБ
Гарячий:    604 800 · 22 · 8 · 10        = 1 064 448 000 Б ≈ 1 064,4 МБ
Теплий:     31 536 000 · 20 · 3 · 8 / 60 =   252 288 000 Б ≈ 252,3 МБ  (агрегати 20 величин)
            31 536 000 · 2 · 8 · 0,1     =    50 457 600 Б ≈  50,5 МБ  (S09, S10 повністю)
Холодний:   7 · 34 560 · 5000 · 2        = 2 419 200 000 Б ≈ 2,42 ГБ  (9,6 год різання на добу)
            1000 · 60 · 5000 · 2         =   600 000 000 Б ≈ 0,60 ГБ  (до 1000 подій на рік)
```

Разом на стенді ≈ 4,4 ГБ на верстат; у виробничій конфігурації ADR-0001 (гарячий рівень 30 діб: 4,56 ГБ) ≈ 7,9 ГБ — в межах NFR-04 (≤ 100 ГБ на верстат на рік) і нижче за оцінку ADR-0001 (≈ 13 ГБ), бо тут не враховано індекси й стиснення.

**Межі рівнів — за сценаріями використання:**

- **Периферія (15 хв):** звертається лише сам шлюз — досилає дані після розриву зв’язку; 15 хв задано NFR-05.
- **Гарячий (7 діб, 10 Гц):** оператор і подання — поточний стан за мілісекунди (Ditto); технолог — розбір операції «вчора/цього тижня» з повною роздільністю в InfluxDB/Grafana, відповідь за секунди. Тиждень покриває типовий цикл переналагодження й повторення партії.
- **Теплий (1 рік, 1 хв):** інженер з обслуговування й майстер — тренди температури підшипників і вібрації, звіти змін і місяців (FR-06, FR-08); хвилинної роздільності для трендів зносу й теплового стану досить, а обсяг у 3,5 раза менший за тиждень гарячого.
- **Холодний (7 діб сирого + 1 рік знімків):** інженер-аналітик раз на кілька тижнів — спектральний розбір конкретного інциденту автоколивань; відповідь за хвилини прийнятна. Сирий сигнал — 95 % обсягу (ЛР 1), тому зберігається лише під час різання.

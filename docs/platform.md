# Платформа цифрового двійника: розгортання і вибір

ЛР 2, заняття 1. Об’єкт — обробний центр з ЧПК (варіант 3), той самий, що в ЛР 1.

## Розгортання

Стенд описано в `platform/docker-compose.yml`: Eclipse Ditto 3.9.7 підключено через `include` без змін у файлах Ditto, а потрібні зміни задає `platform/ditto-override.yml` (дозвіл завантажувати моделі WoT із внутрішнього вебсервера `web`, закриття портів шлюзу й MongoDB, API Ditto лише на `127.0.0.1:8080`). До Ditto додано Mosquitto 2 (1883), nginx `web` (8090: моделі `twin/`, вебподання `ui/`, проксі API лише для читання), InfluxDB 2.9 (8086, кошик `twin`, 7 діб) і Grafana 13 (3000). Відповідність доменам ISO 23247 така сама, як у ЛР 1: емулятор — OME, Mosquitto + з’єднання Ditto з `mapping.js` — DCE, Ditto + історик + InfluxDB — DTE, вебподання й Grafana — UE.

```
cd platform && docker compose up -d
docker compose ps
curl http://localhost:8080/health
```

<!-- AUTO:compose_ps -->
```
SERVICE         STATUS
connectivity    Up 3 minutes (healthy)
ditto-ui        Up 3 minutes
gateway         Up 3 minutes (healthy)
grafana         Up 3 minutes
influxdb        Up 3 minutes
mongodb         Up 3 minutes
mosquitto       Up 3 minutes
nginx           Up 3 minutes
policies        Up 3 minutes (healthy)
swagger-ui      Up 3 minutes
things          Up 3 minutes (healthy)
things-search   Up 3 minutes (healthy)
web             Up 3 minutes

GET /health:
{
  "status": "UP"
}
```
<!-- /AUTO:compose_ps -->

## Перевірка API

Створення тестового двійника (`PUT`), читання двійника і політики, яку Ditto створила автоматично:

```
curl -i -u ditto:ditto -X PUT -H "Content-Type: application/json" \
  -d '{"attributes": {"purpose": "\u043f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0430"}}' \
  http://localhost:8080/api/2/things/org.pzks:test-1
```

Значення `"перевірка"` передано JSON-екрануванням `\uXXXX`: у Git Bash (Windows) `curl` надсилає кирилицю з командного рядка в кодуванні cp1251, і Ditto зберегла б замість літер символи заміни `�`. Дані з файлів (`--data @twin/…json`) надсилаються в UTF-8 без змін.

<!-- AUTO:api_create -->
```http
HTTP/1.1 201 Created
Server: nginx
Date: Tue, 27 Oct 2026 21:31:47 GMT
Content-Type: application/json
Content-Length: 104
Connection: keep-alive
Location: http://localhost:8080/api/2/things/org.pzks:test-1
correlation-id: 76442a4c-9654-4b23-9f35-9ab8905d2160
ditto-originator: nginx:ditto
entity-revision: 3
response-required: false
etag: "rev:3"

{"thingId":"org.pzks:test-1","policyId":"org.pzks:test-1","attributes":{"purpose":"перевірка"}}
```
<!-- /AUTO:api_create -->

```
curl -u ditto:ditto http://localhost:8080/api/2/things/org.pzks:test-1
```

<!-- AUTO:api_get -->
```json
{
  "thingId": "org.pzks:test-1",
  "policyId": "org.pzks:test-1",
  "attributes": {
    "purpose": "перевірка"
  }
}
```
<!-- /AUTO:api_get -->

```
curl -u ditto:ditto http://localhost:8080/api/2/policies/org.pzks:test-1
```

<!-- AUTO:api_policy -->
```json
{
  "policyId": "org.pzks:test-1",
  "imports": {},
  "entries": {
    "DEFAULT": {
      "subjects": {
        "nginx:ditto": {
          "type": "generated"
        }
      },
      "resources": {
        "thing:/": {
          "grant": [
            "READ",
            "WRITE"
          ],
          "revoke": []
        },
        "policy:/": {
          "grant": [
            "READ",
            "WRITE"
          ],
          "revoke": []
        },
        "message:/": {
          "grant": [
            "READ",
            "WRITE"
          ],
          "revoke": []
        }
      },
      "importable": "implicit"
    }
  }
}
```
<!-- /AUTO:api_policy -->

Що показує перевірка: `PUT` на неіснуючий двійник створює його (`201 Created`) і повертає `thingId` та `policyId`; оскільки політику не вказано, Ditto створює політику `DEFAULT` з тим самим ідентифікатором, у якій суб’єкт `nginx:ditto` (обліковий запис `ditto`, автентифікований через nginx) має `READ` і `WRITE` на `thing:/`, `policy:/` і `message:/`. Вебконсоль: <http://localhost:8080/ui/>, опис API (OpenAPI): <http://localhost:8080/apidoc/>.

## Структура двійника

| Елемент | Вид | Ditto | Джерело |
|---|---|---|---|
| Виробник | паспорт | `attributes/manufacturer` | паспорт верстата |
| Модель верстата | паспорт | `attributes/model` | паспорт верстата |
| Заводський номер | паспорт | `attributes/serialNo` | паспорт верстата |
| Система ЧПК | паспорт | `attributes/controller` | паспорт верстата |
| Максимальні оберти шпинделя | паспорт | `attributes/maxSpindleSpeed` | паспорт (12 000 об/хв) |
| Переміщення X / Y / Z | паспорт | `attributes/travelX`, `travelY`, `travelZ` | паспорт (762 / 406 / 508 мм) |
| Дільниця | зв’язок `partOf` | `attributes/cell` = `org.pzks:cell-1` (thingId) | структура виробництва, ЛР 1 (OME «приміщення») |
| Положення осей X / Y / Z | стан | `features/axes/properties/positionX`, `positionY`, `positionZ` | S04, S05, S06 |
| Фактична подача | стан | `features/axes/properties/feedRate` | S07 |
| Струм приводу X | стан | `features/axes/properties/currentX` | S08 |
| Оберти шпинделя | стан | `features/spindle/properties/speed` | S03 |
| Навантаження шпинделя | стан | `features/spindle/properties/load` | S02 |
| Температура підшипників | стан | `features/spindle/properties/bearingTemperature` | S09 |
| Ознаки вібрації (СКЗ, пік, пік-фактор, ексцес, 4 смуги) | стан | `features/vibration/properties/…` | S01 (через шлюз, FR-02) |
| Режим, інструмент, код аварії, температура МОР | стан | `features/status/properties/mode`, `toolNumber`, `alarmCode`, `coolantTemperature` | S11, S12, S13, S10 |
| Номер повідомлення й час відліку | службовий стан | `features/sync/properties/seq`, `ts` | шлюз (для NFR-01) |
| Квитувати сповіщення | функція | повідомлення `inbox/messages/acknowledge-alarm` | оператор (FR-04) |
| Скинути лічильник зносу інструмента | функція | повідомлення `inbox/messages/reset-tool-wear` | оператор після заміни інструмента (FR-05) |

**Як виражено зв’язок.** У Ditto немає окремої сутності «зв’язок»: двійник верстата зберігає в атрибуті `cell` ідентифікатор двійника дільниці `org.pzks:cell-1`, а двійник дільниці — список своїх верстатів в атрибуті `machines`. Для Ditto це лише рядки; що це саме відношення «є частиною», що воно транзитивне (шпиндель → верстат → дільниця) і обернене до `hasPart`, фіксує онтологія `twin/ontology.ttl` (заняття 2), де міркувач виводить зворотний зв’язок автоматично.

**Чому функції — повідомлення, а не властивості.** Квитування й скидання лічильника — дії, а не стан; у Ditto їх надсилають у `inbox` двійника (`POST /api/2/things/org.pzks:cnc-1/inbox/messages/acknowledge-alarm`), і їх обробляє застосунок-підписник (служба аналітики ЛР 1). Двійник верстатом не керує (цифрова тінь, ЛР 1), тому функцій, що змінюють режим ЧПК, немає.

## Порівняння платформ

### Ваги критеріїв (задано до оцінювання)

Ваги виведено з вимог і рішень ЛР 1, ще до огляду платформ:

| Критерій | w | Звідки вага |
|---|---:|---|
| Відкритість (ліцензія, формат моделі) | 0,25 | навчально-дослідницька платформа; модель не має залежати від одного постачальника; формат моделі має бути стандартом (WoT/AAS/NGSI-LD/DTDL) |
| Локальне розгортання | 0,20 | ADR-0001 ЛР 1: виробничі дані не виходять за периметр підприємства (on-premises); стенд ЛР 2 — локальний |
| Підтримка протоколів (MQTT, HTTP, події) | 0,15 | ADR-0002 ЛР 1: шлюз публікує MQTT; потрібен потік змін для подання |
| Масштабованість | 0,15 | NFR-03 ЛР 1: до 10 верстатів, ≈ 100 оновлень/с; запас на дільницю |
| Вартість володіння | 0,15 | ліцензія, інфраструктура, оплата за операції |
| Зрілість спільноти | 0,10 | документація, релізи, активність |
| **Разом** | **1,00** | |

### Оцінки (1–5) з обґрунтуванням

| Критерій | w | Eclipse Ditto | Eclipse BaSyx | FIWARE Orion-LD | Azure Digital Twins |
|---|---:|---:|---:|---:|---:|
| Відкритість | 0,25 | 5 | 5 | 4 | 2 |
| Локальне розгортання | 0,20 | 5 | 5 | 5 | 1 |
| Протоколи | 0,15 | 5 | 3 | 3 | 3 |
| Масштабованість | 0,15 | 4 | 3 | 4 | 5 |
| Вартість володіння | 0,15 | 4 | 4 | 4 | 2 |
| Зрілість спільноти | 0,10 | 4 | 3 | 4 | 4 |
| **S за формулою (1)** | | **4,60** | **4,05** | **4,05** | **2,60** |

Обчислення (Σw = 1): Ditto = 0,25·5 + 0,20·5 + 0,15·5 + 0,15·4 + 0,15·4 + 0,10·4 = 4,60; BaSyx = 1,25 + 1,00 + 0,45 + 0,45 + 0,60 + 0,30 = 4,05; Orion-LD = 1,00 + 1,00 + 0,45 + 0,60 + 0,60 + 0,40 = 4,05; Azure DT = 0,50 + 0,20 + 0,45 + 0,75 + 0,30 + 0,40 = 2,60.

Обґрунтування оцінок:

- **Eclipse Ditto.** Ліцензія EPL-2.0, моделі — W3C WoT Thing Model з валідацією змін ([документація WoT](https://eclipse.dev/ditto/basic-wot-integration.html), [репозиторій](https://github.com/eclipse-ditto/ditto)) → 5. Розгортання Docker Compose / Helm локально → 5. З’єднання MQTT 3/5, AMQP, Kafka, HTTP, події SSE й WebSocket ([connectivity](https://eclipse.dev/ditto/connectivity-overview.html)) → 5. Кластер Pekko з розподілом двійників між вузлами, але оновлення одного двійника обробляються послідовно (перевіряється на занятті 4) → 4. Безкоштовна, проте потребує ≈ 4–6 ГБ пам’яті та MongoDB → 4. Проєкт Eclipse IoT з регулярними релізами → 4.
- **Eclipse BaSyx.** Відкрита реалізація Asset Administration Shell ([eclipse.dev/basyx](https://eclipse.dev/basyx/), [репозиторій](https://github.com/eclipse-basyx/basyx-java-server-sdk)) → 5; локальні образи Docker → 5. API — REST за специфікацією AAS; приймання телеметрії MQTT потребує окремого компонента DataBridge → 3. Масштабування описано менше, ніж для Ditto/Orion → 3. Безкоштовна → 4. Спільнота менша, орієнтована на Industrie 4.0 → 3.
- **FIWARE Orion-LD.** Брокер контексту NGSI-LD ([репозиторій](https://github.com/FIWARE/context.Orion-LD)); ліцензія AGPL-3.0 (копілефт обмежує вбудовування) → 4; локальне розгортання Docker → 5. Північний API — HTTP NGSI-LD, MQTT — через окремі IoT Agents → 3. Горизонтальне масштабування з MongoDB, рекомендації FIWARE для продуктивних систем → 4. Безкоштовна → 4. Екосистема FIWARE з багатьма генеричними компонентами → 4.
- **Azure Digital Twins.** Керована хмарна служба; мова моделей DTDL відкрита, але сама служба пропрієтарна ([огляд](https://learn.microsoft.com/en-us/azure/digital-twins/overview)) → 2. Локального розгортання немає → 1 (суперечить ADR-0001 ЛР 1). Телеметрію приймає через IoT Hub / Event Grid і функції, а не безпосередньо з MQTT ([інтеграція](https://learn.microsoft.com/en-us/azure/digital-twins/how-to-ingest-iot-hub-data)) → 3. Масштабування керує постачальник → 5. Оплата за операції, повідомлення й запити ([ціни](https://azure.microsoft.com/pricing/details/digital-twins/)) — постійні витрати, що зростають з частотою телеметрії → 2. Документація й приклади Microsoft → 4.

AWS IoT TwinMaker до порівняння не включено: у відкритих джерелах трапляються повідомлення про припинення прийому нових клієнтів, але офіційного підтвердження на сторінках AWS під час підготовки звіту не знайдено, тож оцінювати її доступність і вартість надійно неможливо.

### Перевірка на чутливість до ваг

Щоб переконатися, що ваги не «підігнано» під Ditto, ту саму таблицю порахував з рівними вагами (1/6): Ditto 4,50; Orion-LD 4,00; BaSyx 3,83; Azure DT 2,83. Переможець той самий; змінюється лише порядок BaSyx і Orion-LD. Ditto програє Azure DT лише за масштабованістю, і навіть подвоєння ваги цього критерію (0,30 за рахунок відкритості) дає Ditto 4,45 проти 3,05.

**Висновок:** обрано Eclipse Ditto — рішення оформлено як `docs/adr/0004-vybir-platformy.md`.

"""Емулятор граничного шлюзу обробного центру з ЧПК: публікує телеметрію за MQTT.

Запуск з кореня репозиторію: python emulator/emulator.py --rate 10

Формат пристрою — короткі назви полів, як у реальному шлюзі. Кожне повідомлення —
стан верстата за останні 100 мс: дані ЧПК (S02–S13), атрибути ЧПК за зміною
(NC-програма й лічильник деталей, FR-01) і 8 ознак вібрації S01, які шлюз
обчислює з сирого сигналу 5 кГц (ADR-0003 ЛР 1). Перетворення на модель двійника
виконує з’єднання Ditto (platform/mapping.js), а не емулятор.

Кожне повідомлення записується також у results/source.csv — це «істина джерела»,
з якою порівнюють стан двійника.
"""
import argparse
import csv
import json
import math
import random
import time

import paho.mqtt.client as mqtt

BROKER, PORT = "localhost", 1883
FIELDS = ["seq", "ts", "x", "y", "z", "f", "ix", "s", "ld", "tb",
          "md", "tl", "al", "pg", "pc", "tc", "vr", "vp", "vc", "vk", "b1", "b2", "b3", "b4"]
CYCLE = 120.0        # с, цикл обробки однієї деталі
TOOLS = [3, 7, 12]   # інструменти, що змінюються протягом циклу
PROGRAM = "HOUSING_A.MPF"   # активна NC-програма (FR-01)


def phase(t):
    """Фаза циклу: (режим, номер інструмента, чи йде різання, час у фазі)."""
    c = t % CYCLE
    if c < 4:
        return "IDLE", TOOLS[0], False, c
    if c < 110:                                   # три операції по ~35 с із заміною
        k = min(int((c - 4) // 35.3), 2)
        local = (c - 4) - k * 35.3
        if local < 3:
            return "TOOL_CHANGE", TOOLS[k], False, local
        return "RUN", TOOLS[k], local > 6, local  # перші 3 с — підведення (холостий хід)
    return "IDLE", TOOLS[-1], False, c - 110


def sample(t, state):
    """Один стан верстата у момент t, с (формат пристрою)."""
    g = random.gauss
    mode, tool, cutting, local = phase(t)
    # траєкторія: прямокутний контур 200×120 мм на висоті Z = 150 мм
    u = (t * 0.05) % 1.0
    x = 280 + (200 * min(1, 4 * u) if u < 0.5 else 200 * max(0, 4 * (0.75 - u)))
    y = 140 + (120 * min(1, max(0, 4 * (u - 0.25))) if u < 0.75 else 120 * (4 * (1 - u)))
    z = 150.0 if cutting else 180.0
    feed = 1200.0 if cutting else (8000.0 if mode == "RUN" else 0.0)
    speed = 8000.0 if mode == "RUN" else 0.0
    load = 45 + 15 * math.sin(2 * math.pi * t / 17) if cutting else (6 if mode == "RUN" else 0)
    # епізод автоколивань: 6 с у кожному третьому циклі на другій операції
    chatter = cutting and int(t // CYCLE) % 3 == 2 and tool == TOOLS[1] and 10 < local < 16
    rms = (0.9 + g(0, 0.05)) * (2.5 if chatter else 1.0) if cutting else 0.08 + abs(g(0, 0.01))
    crest = 3.2 + g(0, 0.2) if not chatter else 2.1 + g(0, 0.1)
    # температури змінюються повільно (теплова стала хвилини)
    state["tb"] += ((42 if speed else 30) - state["tb"]) * 0.0005 + g(0, 0.01)
    state["tc"] += (24 - state["tc"]) * 0.0002 + g(0, 0.005)
    bands = [0.02, 0.6 * rms ** 2, (3.0 if chatter else 0.08) * rms ** 2, 0.03 * rms ** 2]
    clip = lambda v, lo, hi: min(hi, max(lo, v))
    return {
        "x": round(clip(x + g(0, 0.002), 0, 762), 3),       # мм
        "y": round(clip(y + g(0, 0.002), 0, 406), 3),       # мм
        "z": round(z, 3),                                   # мм
        "f": round(feed, 1),                                # мм/хв
        "ix": round(clip(2 + 0.12 * load + g(0, 0.1), 0, 30), 2),   # А
        "s": round(speed + (g(0, 3) if speed else 0), 1),   # об/хв
        "ld": round(clip(load + g(0, 1), 0, 150), 1),       # %
        "tb": round(state["tb"], 2),                        # °C
        "md": mode,
        "tl": tool,
        "al": 0,
        "pg": PROGRAM,
        "pc": int(t // CYCLE) - int(state["t0"] // CYCLE),   # деталей від запуску
        "tc": round(state["tc"], 2),                        # °C
        "vr": round(clip(rms, 0, 50), 4),                   # g
        "vp": round(clip(rms * crest, 0, 50), 4),           # g
        "vc": round(clip(crest, 1, 20), 3),
        "vk": round(clip(3.0 + g(0, 0.2) + (1.5 if chatter else 0), 0, 50), 3),
        "b1": round(bands[0], 5), "b2": round(bands[1], 5),  # g²
        "b3": round(bands[2], 5), "b4": round(bands[3], 5),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="cnc-1", help="ім’я двійника")
    ap.add_argument("--rate", type=float, default=10.0, help="повідомлень за секунду")
    ap.add_argument("--count", type=int, default=0, help="кількість повідомлень; 0 — без обмеження")
    args = ap.parse_args()

    topic = f"pzks/{args.name}/telemetry"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(BROKER, PORT)
    client.loop_start()
    print(f"Публікація в {topic}, {args.rate} повідомл./с. Ctrl+C — зупинка")

    period, seq, next_time = 1 / args.rate, 0, time.time()
    state = {"tb": 31.0, "tc": 22.5, "t0": time.time()}
    with open("results/source.csv", "w", newline="") as f:
        log = csv.writer(f)
        log.writerow(FIELDS)
        try:
            while args.count == 0 or seq < args.count:
                seq += 1
                now = time.time()
                msg = {"seq": seq, "ts": int(now * 1000), **sample(now, state)}
                client.publish(topic, json.dumps(msg), qos=1)
                log.writerow([msg[k] for k in FIELDS])
                next_time += period
                time.sleep(max(0.0, next_time - time.time()))
        except KeyboardInterrupt:
            pass
    client.loop_stop()
    client.disconnect()
    print(f"Надіслано повідомлень: {seq}")


if __name__ == "__main__":
    main()

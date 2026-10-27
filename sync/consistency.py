"""Перевірка узгодженості стану двійника з джерелом даних.

Запуск з кореня репозиторію після сеансу емулятора, під час якого
працював історик: python sync/consistency.py

Порівнює results/source.csv (що надіслало джерело) з історією станів
у InfluxDB і з поточним станом двійника в Ditto.
"""
import csv
import statistics

import requests
from influxdb_client import InfluxDBClient

THING = "org.pzks:cnc-1"
API = f"http://localhost:8090/api/2/things/{THING}"
INFLUX = {"url": "http://localhost:8086", "token": "dt-lab-token", "org": "pzks"}
TARGET_MS = 200   # NFR-01 ЛР 1: затримка синхронізації p95, мс

# поле пристрою → (feature, властивість моделі)
FIELDS = {
    "x": ("axes", "positionX"), "y": ("axes", "positionY"), "z": ("axes", "positionZ"),
    "f": ("axes", "feedRate"), "ix": ("axes", "currentX"),
    "s": ("spindle", "speed"), "ld": ("spindle", "load"), "tb": ("spindle", "bearingTemperature"),
    "md": ("status", "mode"), "tl": ("status", "toolNumber"), "al": ("status", "alarmCode"),
    "tc": ("status", "coolantTemperature"),
    "vr": ("vibration", "rms"), "vp": ("vibration", "peak"), "vc": ("vibration", "crestFactor"),
    "vk": ("vibration", "kurtosis"), "b1": ("vibration", "band1"), "b2": ("vibration", "band2"),
    "b3": ("vibration", "band3"), "b4": ("vibration", "band4"),
}


def same(a, b):
    """Збіг значення джерела (рядок CSV) і значення двійника."""
    try:
        return abs(float(a) - float(b)) < 1e-9
    except (TypeError, ValueError):
        return str(a) == str(b)


def source():
    with open("results/source.csv", newline="") as f:
        return {int(row["seq"]): row for row in csv.DictReader(f)}


def history(start_ms, stop_ms):
    """Стани двійника з InfluxDB за інтервал часу джерела: {seq: запис}."""
    start, stop = start_ms * 1_000_000, (stop_ms + 1) * 1_000_000
    query = f'''from(bucket: "twin")
  |> range(start: time(v: {start}), stop: time(v: {stop}))
  |> filter(fn: (r) => r._measurement == "twin_state")
  |> filter(fn: (r) => r.thing == "{THING}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")'''
    with InfluxDBClient(**INFLUX) as client:
        tables = client.query_api().query(query)
    return {int(r["seq"]): r.values for t in tables for r in t.records}


def main():
    src = source()
    stamps = [int(r["ts"]) for r in src.values()]
    hist = history(min(stamps), max(stamps))

    missing = sorted(set(src) - set(hist))
    wrong = [s for s in set(src) & set(hist)
             if any(not same(src[s][k], hist[s].get(prop)) for k, (_, prop) in FIELDS.items())]
    order = sorted(hist.values(), key=lambda r: r["revision"])
    reordered = sum(1 for a, b in zip(order, order[1:]) if b["seq"] < a["seq"])
    revs = [int(r["revision"]) for r in order]
    gaps = revs[-1] - revs[0] + 1 - len(revs) if revs else 0

    twin = requests.get(API, timeout=10).json()["features"]
    last = src[max(src)]
    final_ok = all(same(last[k], twin[f]["properties"][p]) for k, (f, p) in FIELDS.items())

    delays = sorted(r["sync_ms"] for r in hist.values())
    latency = "немає даних"
    if delays:
        p95 = delays[max(0, round(0.95 * len(delays)) - 1)]
        verdict = "виконано" if p95 <= TARGET_MS else "НЕ виконано"
        latency = (f"{statistics.median(delays):.0f} / {p95:.0f} "
                   f"(ціль ≤ {TARGET_MS}: {verdict})")

    report = "\n".join([
        "| Перевірка | Результат |",
        "|---|---|",
        f"| Надіслано джерелом | {len(src)} |",
        f"| Є в історії двійника | {len(hist)} ({len(hist) / len(src):.1%}) |",
        f"| Втрачено (номери) | {len(missing)} {missing[:10]} |",
        f"| Розбіжність значень | {len(wrong)} |",
        f"| Позачергові оновлення | {reordered} |",
        f"| Пропущені ревізії (не дійшли до історика) | {gaps} |",
        f"| Кінцевий стан = останній відлік | {'так' if final_ok else 'НІ'} |",
        f"| Затримка синхронізації p50 / p95, мс | {latency} |",
    ])
    print(report)
    with open("results/consistency.md", "w", encoding="utf-8") as f:
        f.write(report + "\n")


if __name__ == "__main__":
    main()

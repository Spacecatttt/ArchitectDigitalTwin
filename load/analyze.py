"""Аналіз навантажувального тестування: затримка й втрати за ступенями.

Запуск з кореня репозиторію після завершення Locust: python load/analyze.py
Вхід: results/sent.csv (надіслано) та історія станів у InfluxDB (отримано).
Вихід: results/load.csv і графік results/latency_vs_load.png.
"""
import csv
import statistics
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from influxdb_client import InfluxDBClient

INFLUX = {"url": "http://127.0.0.1:8086", "token": "dt-lab-token", "org": "pzks"}
TARGET_MS = 200   # NFR-01 ЛР 1, мс


def quantile(values, q):
    values = sorted(values)
    return values[max(0, round(q * len(values)) - 1)]


with open("results/sent.csv", newline="") as f:
    sent = {int(r["seq"]): (int(r["ts"]), int(r["rate"])) for r in csv.DictReader(f)}

stamps = [ts for ts, _ in sent.values()]
start, stop = min(stamps) * 1_000_000, (max(stamps) + 1) * 1_000_000
query = f'''from(bucket: "twin")
  |> range(start: time(v: {start}), stop: time(v: {stop}))
  |> filter(fn: (r) => r._measurement == "twin_state")
  |> filter(fn: (r) => r._field == "seq" or r._field == "sync_ms" or r._field == "revision")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")'''
with InfluxDBClient(**INFLUX) as client:
    records = [r.values for t in client.query_api().query(query) for r in t.records]
received = {int(r["seq"]): r["sync_ms"] for r in records}
revs = sorted(int(r["revision"]) for r in records)
gaps = revs[-1] - revs[0] + 1 - len(revs) if revs else 0

steps = defaultdict(lambda: {"sent": 0, "delays": [], "ts": []})
for seq, (ts, rate) in sent.items():
    steps[rate]["sent"] += 1
    steps[rate]["ts"].append(ts)
    if seq in received:
        steps[rate]["delays"].append(received[seq])

rows = []
for rate in sorted(steps):
    s = steps[rate]
    d = s["delays"]
    span = (max(s["ts"]) - min(s["ts"])) / 1000 or 1
    rows.append({"rate": rate, "actual_rate": round(s["sent"] / span),
                 "sent": s["sent"], "received": len(d),
                 "loss_pct": round(100 * (1 - len(d) / s["sent"]), 2),
                 "p50_ms": round(statistics.median(d)) if d else None,
                 "p95_ms": round(quantile(d, 0.95)) if d else None})

with open("results/load.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
for r in rows:
    print(r)
print(f"Пропущено ревізій: {gaps} (застосовані платформою, але не отримані істориком)")

ok = [r for r in rows if r["p95_ms"] is not None]
x = [r["rate"] for r in ok]
fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(x, [r["p50_ms"] for r in ok], "o-", label="медіана")
ax.plot(x, [r["p95_ms"] for r in ok], "s-", label="95-й процентиль")
ax.axhline(TARGET_MS, color="red", linestyle="--", label=f"ціль NFR-01, {TARGET_MS} мс")
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("Частота телеметрії, повідомлень/с")
ax.set_ylabel("Затримка синхронізації, мс")
ax.set_title("Обробний центр з ЧПК (cnc-1): затримка синхронізації під навантаженням", fontsize=10)
ax.grid(True, which="both", alpha=0.3)
ax.legend()
fig.tight_layout()
fig.savefig("results/latency_vs_load.png", dpi=150)
print("Графік: results/latency_vs_load.png")

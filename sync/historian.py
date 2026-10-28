"""Історія станів двійника: події SSE платформи Ditto → InfluxDB.

Запуск з кореня репозиторію: python sync/historian.py

Затримка синхронізації — різниця між моментом, коли новий стан став доступним
через API, і часом відліку на джерелі (обидва за годинником хоста).
"""
import json
import time

import requests
from influxdb_client import InfluxDBClient, Point, WriteOptions

SSE_URL = "http://127.0.0.1:8090/api/2/things"   # проксі web: лише читання; не localhost: у Windows він спершу йде на ::1, а порти стенда відкриті лише на 127.0.0.1
THING = "org.pzks:cnc-1"
INFLUX = {"url": "http://127.0.0.1:8086", "token": "dt-lab-token", "org": "pzks"}
BUCKET = "twin"
STATE_FEATURES = ("axes", "spindle", "vibration", "status")


def events():
    """Потік змін стану двійника: (подія, момент отримання в мс)."""
    params = {"ids": THING, "fields": "thingId,features,_revision"}
    headers = {"Accept": "text/event-stream"}
    with requests.get(SSE_URL, params=params, headers=headers,
                      stream=True, timeout=(5, None)) as r:
        r.raise_for_status()
        r.encoding = "utf-8"
        print(f"Підключено до потоку змін {THING}. Ctrl+C — зупинка", flush=True)
        for line in r.iter_lines(chunk_size=None, decode_unicode=True):
            if line.startswith("data:") and len(line) > 5:   # порожні — пульс
                yield json.loads(line[5:]), time.time() * 1000


def to_point(thing, received_ms):
    """Подія SSE → точка часового ряду з міткою часу джерела."""
    features = thing.get("features", {})
    sync = features.get("sync", {}).get("properties", {})
    if "ts" not in sync:
        return None
    # мітка джерела в нс + номер повідомлення: інакше точки з однаковою
    # міткою в мс перезаписали б одна одну
    time_ns = sync["ts"] * 1_000_000 + sync["seq"] % 1_000_000
    point = (Point("twin_state").tag("thing", thing["thingId"])
             .time(time_ns, write_precision="ns"))
    for name in STATE_FEATURES:
        props = features.get(name, {}).get("properties", {})
        for key, value in props.items():
            # режим ЧПК — рядок, решта — числа
            point.field(key, value if isinstance(value, str) else float(value))
    return (point.field("seq", int(sync["seq"]))
            .field("revision", int(thing["_revision"]))
            .field("sync_ms", float(received_ms - sync["ts"])))


def main():
    options = WriteOptions(batch_size=500, flush_interval=1000)
    count = 0
    with InfluxDBClient(**INFLUX) as client:
        with client.write_api(write_options=options) as writer:
            try:
                for thing, received in events():
                    point = to_point(thing, received)
                    if point is not None:
                        writer.write(bucket=BUCKET, record=point)
                        count += 1
            except KeyboardInterrupt:
                pass
    print(f"Записано станів: {count}")


if __name__ == "__main__":
    main()

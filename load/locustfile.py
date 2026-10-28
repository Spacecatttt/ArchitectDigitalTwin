"""Навантажувальне тестування каналу телеметрії: ступінчасте зростання частоти.

Запуск з кореня репозиторію (історик має працювати):
    locust -f load/locustfile.py --headless --csv results/locust

Кожен користувач Locust — шлюз верстата, що публікує RATE повідомлень за секунду;
кількість шлюзів зростає за STEPS. Усі шлюзи пишуть в один двійник cnc-1, тож
вимірюється пропускна здатність платформи для одного двійника. Кожне надіслане
повідомлення записується в results/sent.csv для підрахунку втрат.
"""
import csv
import itertools
import json
import os
import time

import paho.mqtt.client as mqtt
from locust import LoadTestShape, User, constant_throughput, task

TOPIC = "pzks/cnc-1/telemetry"
RATE = 5                                        # повідомлень за секунду на один шлюз
STEPS = [1, 2, 5, 10, 20, 40, 80]               # кількість шлюзів на кожному ступені
STEP_TIME = int(os.getenv("STEP_TIME", "60"))   # тривалість ступеня, с
SEQ = itertools.count(1_000_000)                # номери не перетинаються з емулятором
LOG_FILE = open("results/sent.csv", "w", newline="")
LOG = csv.writer(LOG_FILE)
LOG.writerow(["seq", "ts", "rate"])

# валідний стан верстата під час різання (усі значення в діапазонах моделі TM)
STATE = {"x": 412.5, "y": 210.0, "z": 150.0, "f": 1200.0, "ix": 8.6,
         "s": 8000.0, "ld": 55.0, "tb": 38.4, "md": "RUN", "tl": 7, "al": 0,
         "pg": "HOUSING_A.MPF", "pc": 41, "tc": 23.1,
         "vr": 0.92, "vp": 2.95, "vc": 3.2, "vk": 3.1,
         "b1": 0.02, "b2": 0.51, "b3": 0.07, "b4": 0.03}


class Gateway(User):
    wait_time = constant_throughput(RATE)

    def on_start(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.client.connect("127.0.0.1", 1883)   # не localhost (::1 у Windows)
        self.client.loop_start()

    def on_stop(self):
        self.client.loop_stop()
        self.client.disconnect()

    @task
    def publish(self):
        msg = {"seq": next(SEQ), "ts": int(time.time() * 1000), **STATE}
        start = time.perf_counter()
        info = self.client.publish(TOPIC, json.dumps(msg), qos=1)
        info.wait_for_publish(timeout=5)
        rate = self.environment.runner.user_count * RATE
        LOG.writerow([msg["seq"], msg["ts"], rate])
        error = None if info.is_published() else TimeoutError("немає PUBACK")
        self.environment.events.request.fire(
            request_type="MQTT", name="publish", response_length=0,
            response_time=(time.perf_counter() - start) * 1000, exception=error)


class Steps(LoadTestShape):
    """Ступінчасте зростання кількості шлюзів; після останнього — стоп."""

    def tick(self):
        step = int(self.get_run_time() // STEP_TIME)
        if step >= len(STEPS):
            LOG_FILE.flush()
            return None
        return STEPS[step], 100              # кількість шлюзів, швидкість запуску

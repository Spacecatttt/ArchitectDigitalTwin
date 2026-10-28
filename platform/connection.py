"""Створює або оновлює з’єднання MQTT у Ditto: connection.json + mapping.js."""
import json
from pathlib import Path

import requests

HERE = Path(__file__).parent
URL = "http://127.0.0.1:8080/api/2/connections/mqtt-telemetry"
DEVOPS = ("devops", "foobar")          # облікові дані DevOps за замовчуванням

conn = json.loads((HERE / "connection.json").read_text(encoding="utf-8"))
script = (HERE / "mapping.js").read_text(encoding="utf-8")
conn["mappingDefinitions"]["telemetry"]["options"]["incomingScript"] = script

r = requests.put(URL, json=conn, auth=DEVOPS, timeout=30)
print(r.status_code, r.text[:300])
status = requests.get(URL + "/status", auth=DEVOPS, timeout=30).json()
print("Стан з’єднання:", status.get("connectionStatus"))

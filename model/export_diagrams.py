"""Зберігає діаграми з виконаного model/model.ipynb у model/export/*.svg.

Запуск із кореня репозиторію (після виконання блокнота ядром SysML):
python model/export_diagrams.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
# команда %viz у комірці -> ім'я файлу в model/export/
NAMES = {
    "CncMachineTwin::Requirements": "requirements_diagram.svg",
    "--view=tree CncMachineTwin::Structure::CncTwinPlatform": "platform_bdd.svg",
    "--view=interconnection CncMachineTwin::Structure::CncTwinPlatform": "platform_ibd.svg",
    "CncMachineTwin::Structure::EdgeGateway": "edge_gateway_ibd.svg",
    "CncMachineTwin::Behavior::ProcessSample": "process_sample_activity.svg",
    "CncMachineTwin::Behavior::MachineState": "machine_state.svg",
}

nb = json.loads((HERE / "model.ipynb").read_text(encoding="utf-8"))
saved = 0
for cell in nb["cells"]:
    src = "".join(cell["source"]) if isinstance(cell["source"], list) else cell["source"]
    if cell["cell_type"] != "code" or not src.startswith("%viz"):
        continue
    for key, name in NAMES.items():
        if key in src:
            svg = next((o["data"]["image/svg+xml"] for o in cell.get("outputs", [])
                        if "image/svg+xml" in o.get("data", {})), None)
            if svg is None:
                print(f"{name}: у комірці немає діаграми — блокнот не виконано ядром SysML?")
                break
            (HERE / "export" / name).write_text("".join(svg) if isinstance(svg, list) else svg,
                                                encoding="utf-8")
            print(f"{name}: збережено")
            saved += 1
            break
sys.exit(0 if saved == len(NAMES) else 1)

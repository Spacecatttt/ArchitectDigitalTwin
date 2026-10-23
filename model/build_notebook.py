"""Збирає model/model.ipynb з CncMachineTwin.sysml (джерело істини — .sysml)."""
import nbformat as nbf
from pathlib import Path

HERE = Path(__file__).parent
src = (HERE / "CncMachineTwin.sysml").read_text(encoding="utf-8")
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
P = "CncMachineTwin"
cells = [
    md("# Модель платформи ЦД верстата з ЧПК — SysML v2\n\n"
       "ЛР 1, варіант 3. Мова: **SysML v2** (Pilot Implementation, ядро Jupyter `sysml`).\n"
       "Пакети: `Requirements` (вимоги за доменами ISO 23247), `Structure` (блоки й порти), "
       "`Behavior` (діяльність і стани), `Verification` (перевірки, verify), `Traceability` (satisfy)."),
    code(src),
    md("## Діаграма вимог (згруповано за доменами ISO 23247)"),
    code(f"%viz --view=tree {P}::Requirements"),
    md("## Діаграма визначення блоків платформи (аналог BDD)"),
    code(f"%viz --view=tree {P}::Structure::CncTwinPlatform"),
    md("## Внутрішня структура платформи (аналог IBD) — узгоджено з components.mmd"),
    code(f"%viz --view=interconnection {P}::Structure::CncTwinPlatform"),
    md("## Внутрішня структура граничного шлюзу"),
    code(f"%viz --view=interconnection {P}::Structure::EdgeGateway"),
    md("## Поведінка: ключовий сценарій «надходження відліку — валідація — оновлення стану — сповіщення інтерфейсу»"),
    code(f"%viz --view=action {P}::Behavior::ProcessSample"),
    md("## Поведінка: стани верстата, які відстежує двійник (сигнал S11)"),
    code(f"%viz --view=state {P}::Behavior::MachineState"),
    md("## Перелік зв’язків satisfy і verify\n\nМатриця трасовності та покриття — `docs/traceability.md`, автоматична перевірка — `model/trace_check.py`."),
    code(f"%show {P}::Traceability"),
]
nb = nbf.v4.new_notebook()
nb.metadata["kernelspec"] = {"name": "sysml", "display_name": "SysML", "language": "sysml"}
nb.metadata["language_info"] = {"name": "SysML"}
nb.cells = cells
nbf.write(nb, HERE / "model.ipynb")
print("model.ipynb:", len(cells), "комірок")

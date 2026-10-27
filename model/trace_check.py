"""Перевірка трасовності: вимоги requirements.md ↔ модель SysML v2 ↔ traceability.md.

Обчислює покриття трасами C_т = |R_т| / |R| (5) і перевірками C_в = |R_в| / |R| (6)
безпосередньо з тексту моделі (зв'язки satisfy і verify).
Запуск із кореня репозиторію: python3 model/trace_check.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
model = (ROOT / "model" / "CncMachineTwin.sysml").read_text(encoding="utf-8")
req_md = (ROOT / "docs" / "requirements.md").read_text(encoding="utf-8")
trace_md = (ROOT / "docs" / "traceability.md").read_text(encoding="utf-8")

# Вимоги в моделі: requirement <'FR-01'> collectSignals
model_reqs = dict(re.findall(r"requirement <'((?:FR|NFR)-\d+)'> (\w+)", model))   # id -> name
name_to_id = {name: rid for rid, name in model_reqs.items()}

# satisfy X::name by element;   verify X::name;
satisfied = {}
for name, element in re.findall(r"satisfy \w+::(\w+) by ([\w.]+);", model):
    satisfied.setdefault(name_to_id[name], []).append(element)
verified = {}
for vdef, name in re.findall(r"verification def (\w+) \{.*?verify \w+::(\w+);", model, re.S):
    verified.setdefault(name_to_id[name], []).append(vdef)

doc_reqs = set(re.findall(r"^\| ((?:FR|NFR)-\d+) \|", req_md, re.M))
trace_rows = set(re.findall(r"^\| ((?:FR|NFR)-\d+) \|", trace_md, re.M))

R = sorted(model_reqs, key=lambda r: (r.startswith("NFR"), int(r.split("-")[1])))
print(f"{'Вимога':<8} {'Блок (satisfy)':<49} Перевірка (verify)")
for rid in R:
    print(f"{rid:<8} {', '.join(satisfied.get(rid, ['—'])):<49} {', '.join(verified.get(rid, ['—']))}")

n = len(R)
ct = sum(1 for r in R if r in satisfied)
cv = sum(1 for r in R if r in verified)
print(f"\n|R| = {n};  |R_т| = {ct};  |R_в| = {cv}")
print(f"C_т = {ct}/{n} · 100 % = {ct / n:.0%}")
print(f"C_в = {cv}/{n} · 100 % = {cv / n:.0%}")

problems = []
if doc_reqs != set(R):
    problems.append(f"requirements.md ≠ модель: {sorted(doc_reqs ^ set(R))}")
if trace_rows != set(R):
    problems.append(f"traceability.md ≠ модель: {sorted(trace_rows ^ set(R))}")
if ct != n or cv != n:
    problems.append("є вимоги без satisfy або verify")
print("\nУзгодженість:", "OK — ідентифікатори збігаються в усіх трьох місцях" if not problems else "; ".join(problems))
sys.exit(1 if problems else 0)

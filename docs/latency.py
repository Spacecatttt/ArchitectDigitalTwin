"""Модель маршруту «датчик — подання» платформи ЦД верстата з ЧПК.

Що робить сценарій:
  1) обчислює наскрізну затримку L = Σ L_j за формулою (4) для середніх значень;
  2) порівнює суму ділянок до оновлення стану в службі синхронізації з NFR-01, повну суму — з NFR-02;
  3) оцінює 95-й процентиль методом Монте-Карло (у NFR цілі задано для p95);
  4) досліджує чутливість до періоду опитування API інтерфейсом;
  5) оцінює ефект гіпотези Г-01 (push через WebSocket замість опитування).
"""
import random
import statistics

# Послідовні ділянки маршруту, середня затримка, мс (паралельні гілки не входять)
BASE = {
    "ЧПК/датчик → шлюз": 40,      # OPC UA-підписка 50 мс / блок DAQ 50 мс
    "Обробка на шлюзі": 60,       # суміжні вікна 512 відліків (102 мс), без перекриття, валідація
    "Шлюз → брокер": 15,          # MQTT 5, QoS 1, TLS, LAN 1 Гбіт/с
    "Брокер → платформа": 35,     # валідація якості, оновлення стану двійника
    "Платформа → інтерфейс": 290, # опитування REST 500 мс (сер. 250) + HTTP 15 + рендер 25
}
# Ділянки до оновлення стану в службі синхронізації — для NFR-01
SYNC = ["ЧПК/датчик → шлюз", "Обробка на шлюзі", "Шлюз → брокер", "Брокер → платформа"]

TARGET_SYNC = 200  # NFR-01, мс, p95
TARGET_E2E = 500   # NFR-02, мс, p95

POLL_PERIOD = 500  # мс, період опитування REST API веб-панеллю (базова конфігурація)
HTTP_RENDER = 40   # мс, HTTP-запит 15 + рендер 25
PUSH_RENDER = 35   # мс, доставка WebSocket 10 + рендер 25

# Гіпотеза Г-01: push-сповіщення через WebSocket замість опитування API
HYPOTHESIS = {**BASE, "Платформа → інтерфейс": PUSH_RENDER}


def status(value, target):
    return "виконано" if value <= target else "НЕ виконано"


def report(title, route):
    total = sum(route.values())
    sync = sum(route[name] for name in SYNC)
    print(title)
    for name, ms in route.items():
        print(f"  {name:<24}{ms:>5} мс {ms / total:>5.0%}")
    print(f"  {'Синхронізація (NFR-01)':<24}{sync:>5} мс  ціль {TARGET_SYNC}: {status(sync, TARGET_SYNC)}")
    print(f"  {'Разом (NFR-02)':<24}{total:>5} мс  ціль {TARGET_E2E}: {status(total, TARGET_E2E)}")
    return total


# ---------- Монте-Карло: розподіли затримок ділянок ----------
def sample_route(rng, push=False, poll=POLL_PERIOD, load=1.0):
    """Один прогін маршруту; повертає (синхронізація, наскрізна), мс.

    load — коефіцієнт навантаження брокера/служби синхронізації (1.0 = 1 верстат).
    """
    l1 = rng.uniform(15, 65)                       # фаза відносно інтервалу публікації 50 мс + ЧПК
    l2 = rng.uniform(45, 75)                       # половина вікна ознак + обчислення FFT
    l3 = rng.lognormvariate(2.6, 0.35)             # мережа + TLS, медіана ≈ 13.5 мс
    l4 = rng.lognormvariate(3.45, 0.30) * load     # медіана ≈ 31.5 мс, росте з навантаженням
    if push:
        l5 = rng.lognormvariate(2.2, 0.4) + 25     # доставка WS (≈9 мс) + рендер
    else:
        l5 = rng.uniform(0, poll) + rng.lognormvariate(3.6, 0.25)  # очікування опитування + HTTP/рендер
    sync = l1 + l2 + l3 + l4
    return sync, sync + l5


def percentile(data, q):
    data = sorted(data)
    k = (len(data) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(data) - 1)
    return data[lo] + (data[hi] - data[lo]) * (k - lo)


def monte_carlo(push=False, poll=POLL_PERIOD, load=1.0, n=20_000, seed=2026):
    rng = random.Random(seed)
    runs = [sample_route(rng, push, poll, load) for _ in range(n)]
    sync = [s for s, _ in runs]
    e2e = [e for _, e in runs]
    return {
        "sync_med": statistics.median(sync), "sync_p95": percentile(sync, 0.95),
        "e2e_med": statistics.median(e2e), "e2e_p95": percentile(e2e, 0.95),
    }


def main():
    base = report("Базова конфігурація (середні значення, формула 4)", BASE)
    hyp = report("\nГіпотеза Г-01 (середні значення)", HYPOTHESIS)
    print(f"Очікуване зменшення наскрізної затримки (середнє): {1 - hyp / base:.0%}")

    print("\nМонте-Карло, 20 000 прогонів (медіана / p95), мс")
    for title, push in (("Базова (опитування 500 мс)", False), ("Г-01 (push WebSocket)", True)):
        r = monte_carlo(push=push)
        print(f"  {title:<28} синхр. {r['sync_med']:6.0f} / {r['sync_p95']:6.0f}"
              f"  [{status(r['sync_p95'], TARGET_SYNC)}]"
              f"   наскрізна {r['e2e_med']:6.0f} / {r['e2e_p95']:6.0f}"
              f"  [{status(r['e2e_p95'], TARGET_E2E)}]")
    b, h = monte_carlo(), monte_carlo(push=True)
    print(f"  Зменшення медіани наскрізної затримки за Г-01: {1 - h['e2e_med'] / b['e2e_med']:.0%}")

    print("\nЧутливість p95 наскрізної затримки до періоду опитування API, мс")
    for poll in (100, 200, 300, 400, 500, 750, 1000):
        r = monte_carlo(poll=poll)
        print(f"  період {poll:>5} мс → p95 {r['e2e_p95']:6.0f}  [{status(r['e2e_p95'], TARGET_E2E)}]")

    print("\nМасштабування (NFR-03): навантаження служби синхронізації, p95 синхронізації, мс")
    ref = monte_carlo(push=True)["sync_p95"]
    for machines, load in ((1, 1.0), (5, 1.10), (10, 1.25), (20, 1.60)):
        r = monte_carlo(push=True, load=load)
        growth = r["sync_p95"] / ref - 1
        verdict = "виконано" if growth <= 0.30 else "НЕ виконано"
        print(f"  {machines:>2} верстат(и/ів), коеф. {load:.2f} → p95 {r['sync_p95']:6.0f}"
              f"  зростання {growth:+.0%}  [NFR-03: {verdict}; NFR-01: {status(r['sync_p95'], TARGET_SYNC)}]")


if __name__ == "__main__":
    main()

// Спільне для сервера сеансу, бота й клієнта (заняття 3)
export const PORT = 8091;                  // сервер сеансу, WebSocket
export const T_SN = 50;                    // період знімків T_зн, мс (20 Гц)
export const PROFILES = {                  // модельні профілі мережі
  lan: { rtt: 2, jitter: 1, loss: 0, m: 0 },          // локальна мережа цеху
  city: { rtt: 20, jitter: 5, loss: 0.005, m: 1 },    // міська широкосмугова
  mobile: { rtt: 60, jitter: 30, loss: 0.02, m: 1 },  // мобільна
};

// Траєкторія бота: коло радіусом 3 м у центральному проході цеху (між рядами
// верстатів, |z| < 3,9 м) зі швидкістю 1,5 м/с; кожні 10 с — різка зупинка на 2 с
// (наладчик зупиняється біля верстата). Положення в момент ms.
const R = 3, V = 1.5, CYCLE = 10, STOP = 2;
export function walk(ms) {
  const s = ms / 1000, k = Math.floor(s / CYCLE);
  const u = s - k * CYCLE;                // секунда поточного циклу
  const path = (k * (CYCLE - STOP) + Math.min(u, CYCLE - STOP)) * V;
  const a = (path % (2 * Math.PI * R)) / R;
  return { p: [R * Math.cos(a), 1.7, R * Math.sin(a)],
    steady: u > 1 && u < CYCLE - STOP };  // рух без зупинки щонайменше 1 с
}

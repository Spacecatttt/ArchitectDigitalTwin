// Заглушка API Eclipse Ditto для перевірки сцени без Docker (лише для налагодження;
// на стенді стан дає платформа ЛР 2 і emulator/emulator.py).
// Запуск з каталогу scene: node tools/mock-ditto.mjs [--port 8081] [--rate 1]
// Відповідає на GET /api/2/things/<id> і потік SSE /api/2/things?ids=<id>
// тим самим станом, що формує emulator.py після відображення platform/mapping.js.
import { createServer } from 'node:http';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const PORT = arg('--port', 8081), RATE = arg('--rate', 1);
const CYCLE = 120, TOOLS = [3, 7, 12], t0 = Date.now() / 1000;
const g = () => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const st = { tb: 31, tc: 22.5 };
let rev = 1, seq = 0;

function phase(t) {                       // як emulator.phase
  const c = t % CYCLE;
  if (c < 4) return ['IDLE', TOOLS[0], false, c];
  if (c < 110) {
    const k = Math.min(Math.floor((c - 4) / 35.3), 2), local = c - 4 - k * 35.3;
    if (local < 3) return ['TOOL_CHANGE', TOOLS[k], false, local];
    return ['RUN', TOOLS[k], local > 6, local];
  }
  return ['IDLE', TOOLS[2], false, c - 110];
}
function thing() {                        // стан у моделі двійника (mapping.js)
  const t = Date.now() / 1000;
  const [mode, tool, cutting, local] = phase(t);
  const u = (t * 0.05) % 1;
  const x = 280 + (u < 0.5 ? 200 * Math.min(1, 4 * u) : 200 * Math.max(0, 4 * (0.75 - u)));
  const y = 140 + (u < 0.75 ? 120 * Math.min(1, Math.max(0, 4 * (u - 0.25))) : 120 * 4 * (1 - u));
  const speed = mode === 'RUN' ? 8000 : 0;
  const load = cutting ? 45 + 15 * Math.sin((2 * Math.PI * t) / 17) : mode === 'RUN' ? 6 : 0;
  const chatter = cutting && Math.floor(t / CYCLE) % 3 === 2 && tool === TOOLS[1] && local > 10 && local < 16;
  const rms = cutting ? (0.9 + 0.05 * g()) * (chatter ? 2.5 : 1) : 0.08 + Math.abs(0.01 * g());
  st.tb += ((speed ? 42 : 30) - st.tb) * 0.0005 * 10 / RATE + 0.01 * g();
  st.tc += (24 - st.tc) * 0.0002 * 10 / RATE + 0.005 * g();
  seq++;
  return { thingId: 'org.pzks:cnc-1', _revision: ++rev, features: {
    axes: { properties: { positionX: +x.toFixed(3), positionY: +y.toFixed(3),
      positionZ: cutting ? 150 : 180, feedRate: cutting ? 1200 : mode === 'RUN' ? 8000 : 0 } },
    spindle: { properties: { speed, load: +clip(load + g(), 0, 150).toFixed(1),
      bearingTemperature: +st.tb.toFixed(2) } },
    vibration: { properties: { rms: +clip(rms, 0, 50).toFixed(4) } },
    status: { properties: { mode, toolNumber: tool, alarmCode: 0,
      program: 'HOUSING_A.MPF', coolantTemperature: +st.tc.toFixed(2) } },
    sync: { properties: { seq, ts: Date.now() } } } };
}

let state = thing();
const clients = new Set();
setInterval(() => {
  state = thing();
  for (const res of clients) res.write(`data:${JSON.stringify(state)}\n\n`);
}, 1000 / RATE);

createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url.startsWith('/api/2/things/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  } else if (req.url.startsWith('/api/2/things')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(':\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else res.writeHead(404).end();
}).listen(PORT, () => console.log(`Заглушка Ditto: http://localhost:${PORT}/api/2/things`));

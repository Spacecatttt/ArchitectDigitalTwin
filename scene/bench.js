// Відтворюване вимірювання продуктивності сцени (заняття 2).
// Адреса: /scene/?bench=30&label=before[&opt=…][&hz=60] — 3 с прогріву,
// далі 30 с вимірювань під час однакового щоразу руху камери.
import { renderer, scene, camera, controls, tiles, frame, opt, params }
  from './main.js';

const DURATION = Number(params.get('bench')) || 30;      // с
const WARMUP = 3;                                        // с
const BUDGET = 1000 / (Number(params.get('hz')) || 60);  // T_кадру, мс
const label = params.get('label') ?? 'run';
performance.setResourceTimingBufferSize(10000);

renderer.setPixelRatio(1);                // однакова роздільна здатність
renderer.setSize(1920, 1080, false);      // рендерингу: 1920 × 1080
camera.aspect = 16 / 9;
camera.updateProjectionMatrix();
tiles.setResolutionFromRenderer(camera, renderer);

const gl = renderer.getContext();         // час ГП — запити міток часу
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const pending = [];
const rec = { period: [], cpu: [], gpu: [], calls: [], tris: [] };
let start = null, last = null;

function path(s) {                        // рух камери: оберт за 20 с,
  const a = (2 * Math.PI * s) / 20;       // відстань 8…308 м за 30 с
  const r = 8 + 150 * (1 - Math.cos((2 * Math.PI * s) / 30));
  camera.position.set(r * Math.cos(a), 2 + 0.4 * r, r * Math.sin(a));
  controls.target.set(0, 0.5, 0);
  camera.lookAt(controls.target);
}

function pollGpu() {                      // результати надходять із запізненням
  while (pending.length && gl.getQueryParameter(pending[0][0],
    gl.QUERY_RESULT_AVAILABLE)) {
    const [q, i] = pending.shift();
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT))
      rec.gpu[i] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(q);
  }
}

renderer.setAnimationLoop((time) => {
  start ??= time;
  const s = (time - start) / 1000;
  path(s);
  const i = rec.cpu.length, measure = s >= WARMUP;
  const q = measure && timer ? gl.createQuery() : null;
  if (q) gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
  const t0 = performance.now();
  frame(time);
  const cpu = performance.now() - t0;     // T_ЦП: оновлення сцени + команди
  if (q) {
    gl.endQuery(timer.TIME_ELAPSED_EXT);
    pending.push([q, i]);
  }
  if (timer) pollGpu();
  if (measure) {
    if (last !== null) rec.period.push(time - last);
    rec.cpu.push(cpu);
    rec.calls.push(renderer.info.render.calls);
    rec.tris.push(renderer.info.render.triangles);
  }
  last = time;
  if (s >= WARMUP + DURATION + 0.5) finish();
});

const pct = (a, p) => {                   // процентиль
  const s = a.filter((v) => v !== undefined).sort((x, y) => x - y);
  return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))]
    .toFixed(2) : null;
};
const mb = (bytes) => +(bytes / 1e6).toFixed(2);

function textureBytes() {                 // пам’ять текстур на ГП, оцінка
  const seen = new Set();
  let bytes = 0;
  scene.traverse((o) => {
    for (const t of Object.values(o.material ?? {})) {
      if (!t?.isTexture || seen.has(t)) continue;
      seen.add(t);
      bytes += t.isCompressedTexture
        ? t.mipmaps.reduce((sum, m) => sum + m.data.byteLength, 0)
        : (t.image.width * t.image.height * 4 * 4) / 3;   // RGBA + міпмапи
    }
  });
  return bytes;
}

function finish() {
  renderer.setAnimationLoop(null);
  const ff = performance.getEntriesByName('first-frame')[0].startTime;
  const res = performance.getEntriesByType('resource');
  const sum = (list) => list.reduce((s, r) => s + r.encodedBodySize, 0);
  const work = rec.cpu.map((c, i) => Math.max(c, rec.gpu[i] ?? 0));
  const result = {
    label, opt: [...opt].join(','), budget_ms: +BUDGET.toFixed(2),
    frames: rec.cpu.length, fps: +(rec.cpu.length / DURATION).toFixed(1),
    frame_p50_ms: pct(rec.period, 0.5), frame_p99_ms: pct(rec.period, 0.99),
    cpu_p50_ms: pct(rec.cpu, 0.5), cpu_p99_ms: pct(rec.cpu, 0.99),
    gpu_p50_ms: pct(rec.gpu, 0.5), gpu_p99_ms: pct(rec.gpu, 0.99),
    in_budget_pct: +((100 * work.filter((w) => w <= BUDGET).length)
      / work.length).toFixed(1),
    calls_p50: pct(rec.calls, 0.5), calls_max: Math.max(...rec.calls),
    triangles_p50: pct(rec.tris, 0.5), triangles_max: Math.max(...rec.tris),
    textures_mb: mb(textureBytes()),
    first_frame_ms: Math.round(ff),
    data_first_frame_mb: mb(sum(res.filter((r) => r.responseEnd <= ff))),
    data_total_mb: mb(sum(res)), requests: res.length,
    // Частка кадрів, фактичний період яких ≤ 1,05·T_кадру (допуск на дрижання
    // vsync). Без розширення таймера ГП лише цей показник бачить роботу ГП.
    in_budget_period_pct: +((100 * rec.period.filter((p) => p <= BUDGET * 1.05)
      .length) / rec.period.length).toFixed(1),
    gpu_timer: Boolean(timer),
    gpu_renderer: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; })(),
    user_agent: navigator.userAgent,
  };
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  window.benchResult = result;            // для автоматизованого прогону
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json]));
  link.download = `perf-${label}.json`;
  link.textContent = `Зберегти ${link.download}`;
  document.getElementById('stats').replaceChildren(link,
    Object.assign(document.createElement('pre'), { textContent: json }));
}

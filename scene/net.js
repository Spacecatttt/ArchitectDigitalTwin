// Багатокористувацький режим (заняття 3): аватари, позначки, вимірювання.
// Адреса: /scene/?name=A&profile=lan|city|mobile[&mode=interp|extrap]
//         [&measure=60] — через 60 с звіт про бота надсилається серверу
import * as THREE from 'three';
import { scene, camera, renderer, hooks, params } from './main.js';
import { PORT, T_SN, PROFILES, walk } from './shared.js';

const name = params.get('name'), mode = params.get('mode') ?? 'interp';
const profile = PROFILES[params.get('profile')] ? params.get('profile')
  : 'lan';
const { m, jitter } = PROFILES[profile];
const D_INT = (m + 1) * T_SN + jitter;    // затримка інтерполяції, вираз (5)
const ws = new WebSocket(`ws://${location.hostname}:${PORT}/` +
  `?name=${encodeURIComponent(name)}&profile=${profile}`);
const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const snaps = [], offsets = [], avatars = new Map();
const stat = { rtt: [], delay: [], off: [], frames: 0, starved: 0 };
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'snap') {              // буфер знімків за міткою сервера
    snaps.push(msg);
    if (snaps.length > 40) snaps.shift();
    offsets.push(msg.t - Date.now());     // найменш затриманий знімок
    if (offsets.length > 100) offsets.shift();
  } else if (msg.type === 'pong') stat.rtt.push(Date.now() - msg.t);
  else if (msg.type === 'marks') showMarks(msg.marks);
};
setInterval(() => send({ type: 'pose', p: camera.position.toArray(),
  q: camera.quaternion.toArray() }), T_SN);
setInterval(() => send({ type: 'ping', t: Date.now() }), 1000);

function avatar(who) {                    // голова й «ніс» — напрям погляду
  if (!avatars.has(who)) {
    const mat = new THREE.MeshStandardMaterial(
      { color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5) });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35), mat);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5), mat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.45;
    head.add(nose);
    scene.add(head);
    avatars.set(who, head);
  }
  return avatars.get(who);
}

const pa = new THREE.Vector3(), pb = new THREE.Vector3();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function place(who, a, b, k) {            // інтерполяція (0 ≤ k ≤ 1)
  const obj = avatar(who), A = a.avatars[who], B = b.avatars[who];
  if (!A || !B) return;                   // і екстраполяція (k > 1)
  obj.position.lerpVectors(pa.fromArray(A.p), pb.fromArray(B.p), k);
  obj.quaternion.slerpQuaternions(qa.fromArray(A.q), qb.fromArray(B.q),
    Math.min(k, 1));
}

hooks.push(() => {                        // у кожному кадрі
  if (snaps.length < 2) return;
  const now = Date.now(), server = now + Math.max(...offsets);
  const t = mode === 'interp' ? server - D_INT : server;
  let i = snaps.findIndex((s) => s.t > t);
  const starved = i < 0;                  // новіших знімків ще немає
  if (starved) i = snaps.length - 1;
  const a = snaps[Math.max(i - 1, 0)], b = snaps[Math.max(i, 1)];
  let k = Math.max(0, (t - a.t) / (b.t - a.t));
  if (mode === 'interp') k = Math.min(k, 1);
  else k = Math.min(k, 1 + 250 / (b.t - a.t));    // екстраполяція ≤ 250 мс
  for (const who of Object.keys(b.avatars)) if (who !== name)
    place(who, a, b, k);
  for (const [who, obj] of avatars) obj.visible = who in b.avatars;
  if (avatars.has('bot')) measure(now, starved);
});

function measure(now, starved) {          // затримка й відхилення показу бота
  const shown = avatars.get('bot').position;
  let best = 0, min = Infinity;           // τ, за якого walk(now − τ) ≈ показ
  for (let tau = 0; tau <= 600; tau += 2) {
    const d = shown.distanceTo(pb.fromArray(walk(now - tau).p));
    if (d < min) [min, best] = [d, tau];
  }
  stat.frames++;
  stat.starved += starved;
  stat.off.push(min);                     // відхилення від траєкторії, м
  if (walk(now).steady) stat.delay.push(best);   // затримка показу, мс
}

const group = new THREE.Group();          // позначки на сцені й у HUD
scene.add(group);
document.getElementById('hud').insertAdjacentHTML('beforeend',
  `<div>${esc(name)} · ${profile} · ${mode}</div><ul id="marks"></ul>`);
function showMarks(list) {
  group.clear();
  const items = list.map((mk) => {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xd32f2f }));
    pin.rotation.x = Math.PI;             // вістря — у точку позначки
    pin.position.fromArray(mk.p).y += 0.3;
    group.add(pin);
    return `<li>${esc(mk.author)}: ${esc(mk.text)}` + (mk.author === name
      ? ` <a href="#" data-id="${mk.id}">×</a>` : '') + '</li>';
  });
  document.getElementById('marks').innerHTML = items.join('');
}
document.getElementById('marks').onclick = (e) => {
  if (e.target.dataset.id) send({ type: 'unmark', id: +e.target.dataset.id });
};
const ray = new THREE.Raycaster();        // подвійне клацання — позначка
renderer.domElement.addEventListener('dblclick', (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(scene.children, true)[0];
  const text = hit && prompt('Текст позначки', 'Перевірити');
  if (text) send({ type: 'mark', text, p: hit.point.toArray() });
});

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? +s[Math.floor(p * (s.length - 1))].toFixed(3) : null;
};
const seconds = Number(params.get('measure'));
if (seconds) setTimeout(() => {           // звіт: results/net-<профіль>-<режим>
  const report = { type: 'report', profile, mode,
    d_int_ms: mode === 'interp' ? D_INT : 0,
    rtt_p50_ms: pct(stat.rtt, 0.5), delay_p50_ms: pct(stat.delay, 0.5),
    delay_p95_ms: pct(stat.delay, 0.95), off_max_m: pct(stat.off, 1),
    starved_pct: +((100 * stat.starved) / stat.frames).toFixed(1),
    frames: stat.frames };
  send(report);
  window.netReport = report;              // для автоматизованого прогону
  document.getElementById('marks').textContent = JSON.stringify(report);
}, seconds * 1000);

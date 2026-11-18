// Прив’язка стану двійника до елементів сцени за таблицею binding.json:
// bindings — шкала кольору (зелений — min, червоний — max), states — колір за
// значенням-переліком, motions — переміщення вузлів за координатами осей ЧПК.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export async function bindTwin(station) {
  const cfg = await (await fetch('binding.json')).json();
  const color = new THREE.Color();
  const states = cfg.states ?? [], motions = cfg.motions ?? [];
  const total = cfg.bindings.length + states.length + motions.length;
  let sourceTs = 0;                       // час відліку на джерелі, мс
  $('thing').textContent = cfg.thing;
  const row = (id, title, unit) => $('vals').insertAdjacentHTML('beforeend',
    `<tr><td>${title}</td><td id="v-${id}">—</td><td>${unit}</td></tr>`);
  cfg.bindings.forEach((b) => row(b.node, b.title, b.unit));
  states.forEach((b) => row(b.node, b.title, ''));
  motions.forEach((b) => row(b.property, b.title, b.unit));

  function apply(thing) {                 // новий стан двійника → сцена
    const f = thing.features ?? {};
    const get = (b) => f[b.feature]?.properties?.[b.property];
    let bound = 0;
    for (const b of cfg.bindings) {
      const v = get(b);
      if (typeof v !== 'number') continue;
      $(`v-${b.node}`).textContent = v.toFixed(2);
      const x = THREE.MathUtils.clamp((v - b.min) / (b.max - b.min), 0, 1);
      color.setHSL(0.33 * (1 - x), 0.8, 0.45); // зелений → червоний
      if (station.paint(cfg.unit, b.node, color)) bound++;
    }
    for (const b of states) {
      const v = get(b);
      if (v === undefined) continue;
      $(`v-${b.node}`).textContent = v;
      color.set(b.colors[v] ?? '#9e9e9e');
      if (station.paint(cfg.unit, b.node, color)) bound++;
    }
    const offsets = {};                   // зсув кожного вузла від усіх осей, м
    for (const b of motions) {
      const v = get(b);
      if (typeof v !== 'number') continue;
      $(`v-${b.property}`).textContent = v.toFixed(1);
      for (const node of b.nodes) {
        offsets[node] ??= [0, 0, 0];
        offsets[node][b.axis] += (v - b.center) * b.scale;
      }
      bound++;
    }
    for (const [node, d] of Object.entries(offsets))
      station.move(cfg.unit, node, d);
    $('bound').textContent = `${bound} з ${total}`;
    if (thing._revision !== undefined) $('rev').textContent = thing._revision;
    sourceTs = f.sync?.properties?.ts ?? sourceTs;
  }

  const api = '/api/2/things';            // проксі web: лише читання
  fetch(`${api}/${cfg.thing}?fields=features,_revision`)
    .then((r) => r.json()).then(apply).catch(() => {});
  const events = new EventSource(
    `${api}?ids=${cfg.thing}&fields=features,_revision`);
  events.onmessage = (e) => { if (e.data) apply(JSON.parse(e.data)); };

  setInterval(() => {                     // давність даних, 4 рази на секунду
    if (!sourceTs) return;
    const age = (Date.now() - sourceTs) / 1000;
    $('age').textContent = `${age.toFixed(1)} с`;
    $('age').className = age < 2 ? '' : 'stale';
  }, 250);
}

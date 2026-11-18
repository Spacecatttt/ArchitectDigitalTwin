// Геометрична похибка спрощення G (м) для обґрунтування порогів LOD виразом (2).
// Запуск з каталогу scene:
//   node tools/lod-error.mjs models/cnc-machine.glb models/cnc-machine-lod1.glb
// Двобічна відстань Гаусдорфа за вибіркою точок поверхні: точки детальної моделі →
// найближча точка спрощеної і навпаки. Третій рівень — обмежувальний паралелепіпед.
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
async function triangles(file) {          // усі трикутники у світових координатах
  const out = [];
  for (const node of (await io.read(file)).getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const v = (k) => new THREE.Vector3()
        .fromArray(pos.getElement(idx ? idx.getScalar(k) : k, [])).applyMatrix4(m);
      for (let k = 0; k < n; k += 3)
        out.push(new THREE.Triangle(v(k), v(k + 1), v(k + 2)));
    }
  }
  return out;
}

let seed = 1;                              // відтворювана вибірка
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function sample(tris, count) {             // точки, рівномірні за площею
  const area = tris.map((t) => t.getArea());
  const cum = []; area.reduce((s, a, i) => (cum[i] = s + a), 0);
  const total = cum.at(-1), pts = [];
  for (let k = 0; k < count; k++) {
    const r = rnd() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    let u = rnd(), w = rnd();
    if (u + w > 1) [u, w] = [1 - u, 1 - w];
    const t = tris[lo];
    pts.push(new THREE.Vector3().copy(t.a).multiplyScalar(1 - u - w)
      .addScaledVector(t.b, u).addScaledVector(t.c, w));
  }
  return pts;
}
const c = new THREE.Vector3();
function distances(pts, tris) {
  return pts.map((p) => {
    let best = Infinity;
    for (const t of tris) {
      t.closestPointToPoint(p, c);
      const d = c.distanceToSquared(p);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  });
}
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { p99: s[Math.floor(0.99 * (s.length - 1))], max: s.at(-1) };
};
function boxTris(tris) {                   // LOD2 — паралелепіпед
  const b = new THREE.Box3();
  for (const t of tris) b.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
  const g = new THREE.BoxGeometry(...b.getSize(new THREE.Vector3()))
    .translate(...b.getCenter(new THREE.Vector3()));
  const p = g.attributes.position, idx = g.index.array, out = [];
  const v = (k) => new THREE.Vector3().fromBufferAttribute(p, idx[k]);
  for (let k = 0; k < idx.length; k += 3) out.push(new THREE.Triangle(v(k), v(k + 1), v(k + 2)));
  return out;
}

const H = 1080, FOV = 60, tan = Math.tan((FOV * Math.PI) / 360);
const dStar = (G, rho) => (G * H) / (2 * rho * tan);       // вираз (2)
const [detailFile, simpleFile] = process.argv.slice(2);
const detail = await triangles(detailFile), simple = await triangles(simpleFile);
const box = boxTris(detail);
const G = (a, b) => {                      // двобічна: max з двох напрямків
  const ab = stat(distances(sample(a, 4000), b));
  const ba = stat(distances(sample(b, 4000), a));
  return { p99: Math.max(ab.p99, ba.p99), max: Math.max(ab.max, ba.max) };
};
const g1 = G(detail, simple), g2 = G(detail, box);
console.log(`трикутників: детальна ${detail.length}, спрощена ${simple.length}, паралелепіпед 12`);
for (const [name, g] of [['LOD1 (спрощена)', g1], ['LOD2 (паралелепіпед)', g2]]) {
  console.log(`${name}: G p99 = ${(1000 * g.p99).toFixed(1)} мм, max = ${(1000 * g.max).toFixed(1)} мм`);
  for (const rho of [1, 2, 4, 8])
    console.log(`  ρmax = ${rho} пікс → d* = ${dStar(g.max, rho).toFixed(1)} м (за max), ${dStar(g.p99, rho).toFixed(1)} м (за p99)`);
}

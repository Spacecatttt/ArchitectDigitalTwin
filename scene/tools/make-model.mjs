// Модель варіанта 3: вертикально-фрезерний обробний центр VMC-850 і цех
// механообробки, складені з примітивів three.js і записані бібліотекою glTF Transform.
// Запуск з каталогу scene: node tools/make-model.mjs
// Вихід: models/cnc-machine.glb — верстат (ім’я вузла й extras.element кожної
// деталі — її ідентифікатор); models/hall.glb — цех з двома текстурами 2048 × 2048.
// Система координат glTF: Y угору, одиниці — метри; вісь X верстата — уздовж X,
// фронт верстата (зона оператора) — у бік +Z, стійка — позаду (−Z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const R = 192;                            // сегментів по колу: надлишкова деталь

async function glb(name, build) {         // будує файл models/<name>.glb
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.createNode(name);
  doc.createScene(name).addChild(root);
  const acc = (array, type) =>
    doc.createAccessor().setArray(array).setType(type).setBuffer(buffer);
  const mat = (n, rgb, metal = 0.5, rough = 0.5) => doc.createMaterial(n)
    .setBaseColorFactor([...rgb, 1])
    .setMetallicFactor(metal).setRoughnessFactor(rough);
  const tex = (n, bytes) =>
    doc.createTexture(n).setImage(bytes).setMimeType('image/png');
  let tris = 0;
  function part(n, geo, material) {       // ім’я вузла — ідентифікатор елемента
    const a = geo.attributes;
    const prim = doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION', acc(a.position.array, 'VEC3'))
      .setAttribute('NORMAL', acc(a.normal.array, 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(a.uv.array, 'VEC2'))
      .setIndices(acc(new Uint32Array(geo.index.array), 'SCALAR'));
    const mesh = doc.createMesh(n).addPrimitive(prim);
    root.addChild(doc.createNode(n).setMesh(mesh).setExtras({ element: n }));
    tris += geo.index.count / 3;
  }
  build({ mat, tex, part });
  writeFileSync(`models/${name}.glb`, await new NodeIO().writeBinary(doc));
  console.log(`models/${name}.glb: ${tris} трикутників`);
}

const at = (g, x, y, z) => g.translate(x, y, z);
const cyl = (r, h, hs = 1) => new THREE.CylinderGeometry(r, r, h, R, hs); // вісь Y
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const merge = (parts) => mergeGeometries(parts);

function table() {                        // стіл 1,6 × 0,5 м з п’ятьма Т-пазами
  const parts = [box(1.6, 0.1, 0.5)];
  for (let k = 0; k < 6; k++)             // ребра між пазами
    parts.push(box(1.6, 0.03, 0.05).translate(0, 0.065, -0.225 + 0.09 * k));
  return at(merge(parts), 0, 1.0, 0.35);
}

function motor() {                        // двигун шпинделя з 32 ребрами охолодження
  const parts = [cyl(0.17, 0.5, 24)];
  for (let k = 0; k < 32; k++) {
    const a = (2 * Math.PI * k) / 32;
    parts.push(box(0.03, 0.46, 0.02).translate(0.185 * Math.cos(a), 0,
      0.185 * Math.sin(a)));
  }
  return at(merge(parts), 0, 2.72, 0.1);
}

function spindle() {                      // шпиндель: конус і гайка
  const parts = [cyl(0.065, 0.12, 16), new THREE.CylinderGeometry(0.05, 0.065,
    0.05, R, 2).translate(0, -0.085, 0)];
  return at(merge(parts), 0, 1.5, 0.35);
}

function tool() {                         // кінцева фреза Ø 16 мм з 4 канавками
  const parts = [cyl(0.008, 0.11, 24)];
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI * k) / 2;
    parts.push(box(0.004, 0.06, 0.004).translate(0.008 * Math.cos(a), -0.02,
      0.008 * Math.sin(a)));
  }
  return at(merge(parts), 0, 1.385, 0.35);
}

function enclosure() {                    // захисна кабіна: задня й бічні стінки,
  return merge([                          // фронт відкрито (двері відсунуто)
    box(2.7, 2.6, 0.05).translate(0, 1.3, -0.9),
    box(0.05, 2.6, 1.85).translate(-1.35, 1.3, 0.0),
    box(0.05, 2.6, 1.85).translate(1.35, 1.3, 0.0),
    box(2.7, 0.08, 0.08).translate(0, 2.6, 0.9),     // верхня поперечина фронту
  ]);
}

function png(size, pixel) {               // мінімальний кодер PNG: RGB, 8 біт
  const row = 3 * size + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * row + 1 + 3 * x);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))]);
}

const hash = (x, y) => {                  // псевдовипадкове 0…1, відтворюване
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const shade = (v, rgb) => rgb.map((c) => Math.max(0, Math.min(255, c + v)));

// Підлога цеху: епоксидне покриття з плитами 2 × 2 м і жовтою розміткою проходу
const floor = (x, y) => {
  if (y % 512 >= 236 && y % 512 < 276 && x % 256 < 160) return [214, 178, 40];
  return shade(10 * hash(x >> 6, y >> 6) + 5 * hash(x, y)
    - (x % 256 < 3 || y % 256 < 3 ? 35 : 0), [118, 132, 128]);
};
// Стіни: сендвіч-панелі з вертикальними ребрами
const panel = (x, y) => shade(12 * hash(x >> 8, 0) + 3 * hash(x, y)
  - (x % 128 < 6 ? 30 : 0) - (y % 1024 < 8 ? 40 : 0), [200, 204, 208]);

mkdirSync('models', { recursive: true });
await glb('cnc-machine', ({ mat, part }) => {
  const cast = mat('cast', [0.55, 0.58, 0.6], 0.6, 0.5);      // чавун
  const steel = mat('steel', [0.72, 0.74, 0.76], 0.9, 0.3);
  const paint = mat('paint', [0.18, 0.45, 0.62], 0.2, 0.6);   // фарба корпусу
  const light = mat('light', [0.85, 0.86, 0.84], 0.1, 0.7);   // світлі панелі
  const dark = mat('dark', [0.12, 0.13, 0.15], 0.3, 0.6);
  part('base', at(box(2.2, 0.8, 1.6), 0, 0.4, 0.1), cast);
  part('saddle', at(box(1.0, 0.15, 0.8), 0, 0.875, 0.35), cast);
  part('table', table(), steel);
  part('workpiece', at(box(0.3, 0.15, 0.2), 0, 1.14, 0.35), steel);
  part('column', at(box(0.8, 2.0, 0.7), 0, 1.8, -0.45), paint);
  part('head', at(box(0.5, 0.7, 0.75), 0, 2.12, 0.12), paint);
  part('motor', motor(), dark);
  part('bearing', at(cyl(0.13, 0.22, 16), 0, 1.66, 0.35), steel);
  part('spindle', spindle(), steel);
  part('tool', tool(), dark);
  part('enclosure', enclosure(), light);
  part('panel', merge([box(0.55, 0.7, 0.1).translate(0, 1.5, 0),
    box(0.08, 1.15, 0.08).translate(0, 0.575, -0.06)])
    .rotateY(-0.6).translate(1.65, 0, 0.75), dark);
  part('coolant', at(box(0.6, 0.45, 0.5), -1.75, 0.225, -0.3), paint);
  part('lamp', at(cyl(0.04, 0.24, 12), 0.3, 2.92, -0.45), light);
  part('sensor-vib', at(box(0.05, 0.05, 0.05), 0.275, 1.95, 0.3), dark);
});
await glb('hall', ({ mat, tex, part }) => {
  const f = mat('floor', [1, 1, 1], 0, 0.9)
    .setBaseColorTexture(tex('floor', png(2048, floor)));
  const w = mat('wall', [1, 1, 1], 0, 0.9)
    .setBaseColorTexture(tex('wall', png(2048, panel)));
  part('floor', at(box(40, 0.2, 18), 0, -0.1, 0), f);
  part('wall-n', at(box(40, 6, 0.3), 0, 3, -9.15), w);
  part('wall-s', at(box(40, 6, 0.3), 0, 3, 9.15), w);
  part('wall-w', at(box(0.3, 6, 18.6), -20.15, 3, 0), w);
  part('wall-e', at(box(0.3, 6, 18.6), 20.15, 3, 0), w);
});
console.log('Готово: models/cnc-machine.glb, models/hall.glb');

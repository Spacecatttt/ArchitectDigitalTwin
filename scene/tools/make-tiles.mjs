// Великий набір даних: рельєф майданчика машинобудівного заводу 2048 × 2048 м
// навколо цеху механообробки, 3D Tiles 1.1.
// Запуск з каталогу scene: node tools/make-tiles.mjs
// Квадродерево: рівні 0…4, 341 тайл; кожен тайл — сітка 64 × 64 комірки.
// Похибка рівня k — G_k = G_0 / 2^k, у листків — 0 (лекція 9, вираз (5)).
// Каталог tiles/ у репозиторій не додається: його відтворює цей сценарій.
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync, writeFileSync } from 'node:fs';

const SIZE = 2048, DEPTH = 4, N = 64;   // сторона, м; рівні; комірок у тайлі
const G0 = SIZE / N;                    // похибка кореня = крок сітки, м
const OUT = 'tiles/site/v1';            // версія — у шляху: файли незмінні
const io = new NodeIO();

function height(x, y) {                 // модельний рельєф, м; цех (40 × 18 м)
  const r = Math.min(1, Math.max(0, (Math.hypot(x, y) - 60) / 140)); // — на рівній
  return -0.2 + r * (14 * Math.sin(x / 190) * Math.cos(y / 240)     // площадці
    + 5 * Math.sin(x / 41 + 1) * Math.sin(y / 57)
    + 1.2 * Math.sin(x / 9) * Math.cos(y / 11));
}

let count = 0, tris = 0;
async function tile(level, ix, iy) {    // пише один тайл, повертає опис
  const s = SIZE / 2 ** level;
  const x0 = -SIZE / 2 + ix * s, y0 = -SIZE / 2 + iy * s;
  const pos = new Float32Array((N + 1) ** 2 * 3);
  const col = new Uint8Array((N + 1) ** 2 * 4);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0, v = 0; j <= N; j++)
    for (let i = 0; i <= N; i++, v++) {
      const x = x0 + (i * s) / N, y = y0 + (j * s) / N, h = height(x, y);
      pos.set([x, h, -y], 3 * v);       // glTF: вісь Y угору
      const t = Math.min(1, Math.max(0, (h + 5) / 25));
      col.set([70 + 90 * t, 120 - 10 * t, 60 + 30 * t, 255], 4 * v);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  const idx = new Uint16Array(N * N * 6);
  for (let j = 0, k = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + N + 1;
      idx.set([a, a + 1, b, b, a + 1, b + 1], k);
      k += 6;
    }
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (a, type) =>
    doc.createAccessor().setArray(a).setType(type).setBuffer(buf);
  const prim = doc.createPrimitive().setIndices(acc(idx, 'SCALAR'))
    .setAttribute('POSITION', acc(pos, 'VEC3'))
    .setAttribute('COLOR_0', acc(col, 'VEC4').setNormalized(true))
    .setMaterial(doc.createMaterial('ground').setRoughnessFactor(1)
      .setMetallicFactor(0));
  doc.createScene().addChild(
    doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  const uri = `${level}/${ix}_${iy}.glb`;
  writeFileSync(`${OUT}/${uri}`, await io.writeBinary(doc));
  count++; tris += N * N * 2;
  const t = {                            // вісь Z тайлсету — угору
    boundingVolume: { box: [x0 + s / 2, y0 + s / 2, (lo + hi) / 2,
      s / 2, 0, 0, 0, s / 2, 0, 0, 0, Math.max((hi - lo) / 2, 0.5)] },
    geometricError: level < DEPTH ? G0 / 2 ** level : 0,
    content: { uri },
  };
  if (level < DEPTH) {
    t.children = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
      t.children.push(await tile(level + 1, 2 * ix + dx, 2 * iy + dy));
  }
  return t;
}

for (let k = 0; k <= DEPTH; k++) mkdirSync(`${OUT}/${k}`, { recursive: true });
const root = await tile(0, 0, 0);
root.refine = 'REPLACE';
writeFileSync(`${OUT}/tileset.json`, JSON.stringify({
  asset: { version: '1.1', tilesetVersion: 'v1' },
  geometricError: 2 * G0, root }));
console.log(`Готово: ${OUT}/tileset.json — тайлів ${count}, трикутників ${tris}`);

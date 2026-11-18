// Кількість трикутників у файлах glTF. Запуск з каталогу scene: node tools/tris.mjs models/*.glb
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
for (const f of process.argv.slice(2)) { const d = await io.read(f); let t=0;
 for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount())/3;
 console.log(f, t); }

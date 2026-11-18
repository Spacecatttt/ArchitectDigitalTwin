// Цех механообробки й верстати: моделі glTF, рівні деталізації, відсікання,
// оптимізації заняття 2 (параметр адреси ?opt=…)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const loader = new GLTFLoader();
// 16 верстатів: два ряди по 8 з кроком 4,5 м, фронтом до центрального проходу.
// [x, y, z, поворот навколо Y]; cnc-1 — перший у північному ряду.
export const SLOTS = Array.from({ length: 16 }, (_, i) =>
  [-15.75 + 4.5 * (i % 8), 0, i < 8 ? -5 : 5, i < 8 ? 0 : Math.PI]);
const slotMatrix = ([x, y, z, ry]) =>
  new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);

const elementOf = (o) => {        // найближчий предок з extras.element
  while (o && o.userData.element === undefined) o = o.parent;
  return o?.userData.element;
};

function boxOf(model) {           // LOD2: обмежувальний паралелепіпед моделі
  const b = new THREE.Box3().setFromObject(model);
  const geo = new THREE.BoxGeometry(...b.getSize(new THREE.Vector3()));
  geo.translate(...b.getCenter(new THREE.Vector3()));
  return new THREE.Mesh(geo,
    new THREE.MeshStandardMaterial({ color: 0x8a8f96 }));
}

// Стан, який сцена накладає на модель: кольори й зсуви елементів верстатів.
// Його застосовують і до сіток, створених пізніше (defer), щоб не чекати
// наступного оновлення двійника.
const colors = new Map();         // "<екземпляр>:<елемент>" → THREE.Color
const offsets = new Map();        // "<екземпляр>:<елемент>" → THREE.Vector3
const m = new THREE.Matrix4(), t = new THREE.Matrix4();

function placeInstance(mesh, i) { // матриця екземпляра: слот · зсув осі · деталь
  const d = offsets.get(`${i}:${mesh.name}`);
  m.copy(slotMatrix(SLOTS[i]));
  if (d) m.multiply(t.makeTranslation(d.x, d.y, d.z));
  mesh.setMatrixAt(i, m.multiply(mesh.userData.base));
}

function instanced(model) {       // одна InstancedMesh на кожну деталь
  const group = new THREE.Group();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = new THREE.InstancedMesh(o.geometry, o.material.clone(),
      SLOTS.length);
    mesh.name = elementOf(o) ?? '';
    mesh.userData.base = o.matrixWorld.clone();
    const base = o.material.color.clone();
    mesh.material.color.set(0xffffff);    // колір задає екземпляр
    SLOTS.forEach((_, i) => {
      placeInstance(mesh, i);
      mesh.setColorAt(i, colors.get(`${i}:${mesh.name}`) ?? base);
    });
    mesh.computeBoundingSphere();          // сфера всіх екземплярів — для відсікання
    group.add(mesh);
  });
  return group;
}

function setLevel0(lod, object) {          // заміна детального рівня LOD
  lod.remove(lod.levels[0].object);
  lod.levels[0].object = object;
  lod.add(object);
}

// Оптимізації заняття 2 вмикає параметр адреси ?opt=…: inst — інстансування,
// ktx2 — стиснені текстури, simp — спрощена детальна модель,
// defer — відкладене завантаження детальної моделі й тайлів
export async function loadStation(scene, opt, renderer) {
  if (opt.has('ktx2')) {                  // декодер KTX2 → формат, що є на ГП
    const ktx2 = new KTX2Loader().setTranscoderPath(
      'node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }
  const detail = opt.has('simp') ? 'models/cnc-machine-s.glb'
    : 'models/cnc-machine.glb';
  const files = [opt.has('ktx2') ? 'models/hall-ktx2.glb' : 'models/hall.glb',
    'models/cnc-machine-lod1.glb'];
  if (!opt.has('defer')) files.push(detail);
  const [hall, lod1, lod0 = lod1] = await Promise.all(
    files.map((url) => loader.loadAsync(url)));
  scene.add(hall.scene);
  const box = boxOf(lod1.scene);
  const group = new THREE.Group();
  const levels = (make) => [[make(lod0.scene), 0], [make(lod1.scene), 15],
    [make(box), 60], [new THREE.Object3D(), 250]];

  if (opt.has('inst')) {                  // один LOD на всю групу верстатів:
    const lod = new THREE.LOD();          // відстань — до центру цеху, тому
    levels(instanced).forEach(([o, d], k) => lod.addLevel(o, d * 2, k && 0.1));
    group.add(lod);                       // пороги подвоєно
  } else {                                // LOD для кожного верстата
    SLOTS.forEach(([x, y, z, ry], i) => {
      const lod = new THREE.LOD();
      lod.name = `cnc-${i + 1}`;
      levels((o) => o.clone()).forEach(([o, d], k) =>
        lod.addLevel(o, d, k && 0.1));
      lod.position.set(x, y, z);
      lod.rotation.y = ry;
      group.add(lod);
    });
  }
  scene.add(group);

  const index = (unit) => Number(unit.split('-')[1]) - 1;   // cnc-1 → 0

  function paint(unit, element, color) { // колір елемента одного верстата
    let found = false;
    if (opt.has('inst')) {
      const i = index(unit);
      colors.set(`${i}:${element}`, color.clone());
      group.traverse((o) => {
        if (!o.isInstancedMesh || o.name !== element) return;
        o.setColorAt(i, color);
        o.instanceColor.needsUpdate = found = true;
      });
      return found;
    }
    group.getObjectByName(unit)?.traverse((o) => {
      if (!o.isMesh || elementOf(o) !== element) return;
      if (!o.userData.own) {              // власна копія матеріалу:
        o.material = o.material.clone(); // спільний змінив би всі верстати
        o.userData.own = true;
      }
      o.material.color.copy(color);
      found = true;
    });
    return found;
  }

  function move(unit, element, offset) { // зсув елемента за координатою осі, м
    if (opt.has('inst')) {
      const i = index(unit);
      offsets.set(`${i}:${element}`, new THREE.Vector3(...offset));
      group.traverse((o) => {
        if (!o.isInstancedMesh || o.name !== element) return;
        placeInstance(o, i);
        o.instanceMatrix.needsUpdate = true;
      });
      return;
    }
    group.getObjectByName(unit)?.traverse((o) => {
      if (o.userData.element !== element) return;   // сам іменований вузол
      o.userData.base ??= o.position.clone();
      o.position.copy(o.userData.base).add(new THREE.Vector3(...offset));
    });
  }

  async function afterFirstFrame() {      // defer: детальна модель — пізніше
    if (!opt.has('defer')) return;
    const model = (await loader.loadAsync(detail)).scene;
    for (const lod of group.children)
      setLevel0(lod, opt.has('inst') ? instanced(model) : model.clone());
  }
  return { group, paint, move, afterFirstFrame };
}

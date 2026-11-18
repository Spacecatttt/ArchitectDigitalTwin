// Цех механообробки й верстати: моделі glTF, рівні деталізації, відсікання
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
// 16 верстатів: два ряди по 8 з кроком 4,5 м, фронтом до центрального проходу.
// [x, y, z, поворот навколо Y]; cnc-1 — перший у північному ряду.
export const SLOTS = Array.from({ length: 16 }, (_, i) =>
  [-15.75 + 4.5 * (i % 8), 0, i < 8 ? -5 : 5, i < 8 ? 0 : Math.PI]);

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

export async function loadStation(scene) {
  const [hall, lod0, lod1] = await Promise.all([
    'models/hall.glb', 'models/cnc-machine.glb', 'models/cnc-machine-lod1.glb',
  ].map((url) => loader.loadAsync(url)));
  scene.add(hall.scene);
  const group = new THREE.Group();
  const box = boxOf(lod0.scene);
  SLOTS.forEach(([x, y, z, ry], i) => {
    const lod = new THREE.LOD();
    lod.name = `cnc-${i + 1}`;
    lod.addLevel(lod0.scene.clone(), 0);          // детальна модель
    lod.addLevel(lod1.scene.clone(), 15, 0.1);    // спрощена; гістерезис 10 %
    lod.addLevel(box.clone(), 60, 0.1);           // паралелепіпед
    lod.addLevel(new THREE.Object3D(), 250);      // далі — не рисувати
    lod.position.set(x, y, z);
    lod.rotation.y = ry;
    group.add(lod);
  });
  scene.add(group);

  function paint(unit, element, color) { // колір елемента одного верстата
    let found = false;
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

  function move(unit, element, offset) { // зсув вузла за координатою осі, м
    group.getObjectByName(unit)?.traverse((o) => {
      if (o.userData.element !== element) return;   // сам іменований вузол
      o.userData.base ??= o.position.clone();
      o.position.copy(o.userData.base).add(new THREE.Vector3(...offset));
    });
  }
  return { group, paint, move };
}

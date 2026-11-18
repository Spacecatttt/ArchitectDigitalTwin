// 3D-сцена двійника верстата з ЧПК: рендерер, камера, рельєф (3D Tiles), цикл кадру
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { loadStation } from './station.js';
import { bindTwin } from './twin.js';

export const params = new URLSearchParams(location.search);
export const opt = new Set(params.get('opt')?.split(',')); // заняття 2
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9dbea);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(30, 50, 20);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 2), sun);

const VIEWS = {                    // [положення камери, точка огляду], м
  near: [[-18.6, 2.9, 0.6], [-15.4, 1.1, -5]],    // біля cnc-1, зона оператора
  hall: [[22, 16, 24], [0, 0.5, 0]],               // увесь цех
  far: [[400, 220, 400], [0, 0, 0]],               // майданчик заводу
  aisle: [[6, 3.2, 1.5], [-12, 2.0, -2]],          // уздовж проходу до cnc-1 (заняття 3)
  sky: [[0, 30, 0], [0, 60, 0.01]],   // угору, майже нічого не рисується: вимірювання
};                                    // мережі (крок 11) на машині без апаратного ГП
const [eye, look] = VIEWS[params.get('view')] ?? VIEWS.hall;
export const camera = new THREE.PerspectiveCamera(
  60, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(...eye);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...look);
controls.update();

// Великий набір даних — рельєф майданчика заводу: потокове завантаження тайлів
export const tiles = new TilesRenderer('tiles/site/v1/tileset.json');
tiles.errorTarget = Number(params.get('error')) || 16;  // ρ_max, пікселі
tiles.lruCache.minBytesSize = 24 * 2 ** 20;   // бюджет кешу тайлів, байти
tiles.lruCache.maxBytesSize = 32 * 2 ** 20;
tiles.setCamera(camera);
tiles.setResolutionFromRenderer(camera, renderer);
tiles.group.rotation.x = -Math.PI / 2;        // тайлсет: Z угору → Y угору
scene.add(tiles.group);

export const station = await loadStation(scene, opt, renderer);
if (params.get('cull') === '0')               // для порівняння: без відсікання
  scene.traverse((o) => { o.frustumCulled = false; });
bindTwin(station);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  tiles.setResolutionFromRenderer(camera, renderer);
});

export const hooks = [];                      // викликаються в кожному кадрі
const stats = document.getElementById('stats');
let frames = 0;
export function frame(time) {
  camera.updateMatrixWorld();
  if (frames > 0 || !opt.has('defer')) tiles.update();
  for (const hook of hooks) hook(time);
  renderer.render(scene, camera);
  if (frames++ === 0) {                       // перший кадр зі станцією
    performance.mark('first-frame');
    station.afterFirstFrame?.();              // відкладене завантаження
  }
  const { calls, triangles } = renderer.info.render;
  const s = tiles.stats;
  stats.textContent = `викликів ${calls} · трикутників ${triangles}` +
    ` · тайлів видно ${tiles.visibleTiles.size}, у кеші ${s.inCache},` +
    ` завантажується ${s.downloading}`;
}
renderer.setAnimationLoop(frame);

// Модулі занять 2 і 3 вмикаються параметрами адреси ?bench=… і ?name=…
if (params.has('bench')) import('./bench.js');
if (params.has('name')) import('./net.js');

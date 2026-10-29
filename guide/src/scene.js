// The renderer, camera, lights and room: everything in the 3D view that isn't a part.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { $, V3, EMBED } from './config.js';
import { plankTexture } from './textures.js';

export const canvas = $('scene');
export const viewport = $('viewport');

export let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  $('loading').textContent = 'Your browser could not start 3D graphics (WebGL). Try another browser or device.';
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

export const camera = new THREE.PerspectiveCamera(35, 1, 2, 6000);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.minDistance = 20;
controls.maxDistance = 1500;
controls.screenSpacePanning = true;
if (EMBED) {
  // Inside a page: scrolling and vertical swipes should scroll the page, not zoom or turn the model.
  controls.enableZoom = false;
  controls.autoRotateSpeed = 0.8;
  canvas.style.touchAction = 'pan-y';
  controls.addEventListener('start', () => (controls.autoRotate = false));
}

const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
key.position.set(-120, 220, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -340, right: 340, top: 340, bottom: -340, near: 10, far: 1200 });
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.3;
key.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xd6e4ff, 0.5);
fill.position.set(200, 80, 120);
scene.add(key, fill);

// Room: plank floor and a painted wall.
{
  const floorTex = plankTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(16, 16); // each tile is about 1.8 m of floorboards
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 110),
    new THREE.MeshStandardMaterial({ color: 0x6f7f8a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(20, 0, 10);
  rug.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3000, 400), new THREE.MeshStandardMaterial({ color: 0xe9e6e1, roughness: 0.95 }));
  wall.position.set(0, 200, -90);
  wall.receiveShadow = true;
  scene.add(floor, rug, wall);
}

// A camera direction: degrees around the product (0 is the front) and up from the floor.
export function viewDir(azimuthDeg, elevationDeg = 24) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  return new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

// Colours follow the page theme.
function applyTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#dfe3e8';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 1400, 4000);
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
applyTheme();

export function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(viewport);

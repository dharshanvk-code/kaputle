// Building a part's 3D model from its entry in the product file.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { V3, Q } from './config.js';
import { birchTexture } from './textures.js';

function makeMaterials() {
  return {
    birch: new THREE.MeshStandardMaterial({ map: birchTexture(), roughness: 0.6 }),
    hardboard: new THREE.MeshStandardMaterial({ color: 0x8c6a48, roughness: 0.92 }),
    dowel: new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd3d7dc, metalness: 0.75, roughness: 0.38 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd2aa55, metalness: 1, roughness: 0.3 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.95 }),
    blackbrown: new THREE.MeshStandardMaterial({ map: birchTexture(), color: 0x4a3a32, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.55 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6 }),
    felt: new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 1 }),
  };
}

export const MATS = makeMaterials();

export const UP = new V3(0, 1, 0);
export const DOWN = new V3(0, -1, 0);

export function shadowed(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Every part is built at its own origin. Boards and dowels are centred; headed parts
// (screws, nails) have the head at the origin and the shaft pointing down local -Y.
export function buildPart(p) {
  const mat = MATS[p.material] || MATS.birch;
  const g = new THREE.Group();
  if (p.shape === 'board') {
    const [x, y, z] = p.size;
    const r = Math.min(0.15, Math.min(x, y, z) / 2.2);
    g.add(shadowed(new THREE.Mesh(new RoundedBoxGeometry(x, y, z, 2, r), mat.clone())));
  } else if (p.shape === 'dowel' || p.shape === 'pin') {
    const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.length, 20), mat.clone()));
    g.add(m);
  } else if (p.shape === 'knob') {
    // A mushroom knob: the stem end (+y) meets the face it's fitted to, the round head is outside.
    const L = p.length;
    const R = p.radius;
    const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.55, L * 0.5, 24), mat.clone()));
    stem.position.y = L / 4;
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), stem.material));
    head.scale.y = (L * 0.5) / (2 * R);
    head.position.y = -L / 4;
    g.add(stem, head);
  } else if (p.shape === 'screw' || p.shape === 'nail') {
    const headR = p.shape === 'screw' ? p.radius * 2.1 : p.radius * 3;
    const headH = p.shape === 'screw' ? 0.22 : 0.08;
    const head = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(headR, headR * 0.92, headH, 24), mat.clone()));
    head.position.y = -headH / 2;
    const shaft = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius * 0.4, p.length, 16), head.material));
    shaft.position.y = -headH - p.length / 2;
    g.add(head, shaft);
    if (p.shape === 'screw') {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      slot.position.y = 0.005;
      g.add(slot);
    }
  }
  g.traverse((o) => {
    if (o.isMesh) o.userData.part = p.id;
  });
  return g;
}

// Final orientation: boards are modelled in place; hardware turns to face its insertion direction.
export function assembledQuat(p) {
  if (!p.dir) return new Q();
  const dir = new V3(...p.dir).normalize();
  return new Q().setFromUnitVectors(p.shape === 'screw' || p.shape === 'nail' ? DOWN : UP, dir);
}

export function partExtent(p) {
  if (p.shape === 'board') return new V3(...p.size);
  return new V3(p.radius * 2, p.length, p.radius * 2);
}

// The axis a part travels along as it goes in: screws and nails are built pointing down.
export const canonicalAxis = (p) => (p.shape === 'screw' || p.shape === 'nail' ? DOWN : UP);
export const absV = (v) => v.set(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));

// The guide's shared state. Positions in the product file describe the finished, upright
// product. Parts that have been fitted live inside `assembly`, which can start on its side or
// upside down and be turned over, or be lifted and lowered onto another part, the way manuals
// do. A part with a `parent` is fitted to that part first, even while the parent is still on the
// floor, and then travels with it.
import * as THREE from 'three';
import { V3, Q } from './config.js';
import { scene } from './scene.js';

export const G = {
  product: null,
  objects: {}, // part id -> its 3D object
  pile: {}, // part id -> where it lies in the box
  rest: {}, // part id -> where it waits now: in the box, or set out on the floor
  staged: [], // parts set out on the floor, newest last: { step, kind, ids, prev, poses, z0, z1 }
  finalM: {}, // part id -> pose in the finished product
  localM: {}, // part id -> pose inside the assembly group
  relM: {}, // part id -> pose relative to its parent part
  stepOf: {}, // part id -> index of the step that fits it
  assembledBox: new THREE.Box3(), // the finished product
  pivot: new V3(), // the middle of the finished product; the assembly turns about it
  stageZ: 40, // nearest row where parts are set out
  stageW: 160, // widest a row of set-out parts gets before it wraps
  done: 0, // number of completed steps
  busy: false,
  autoplay: false,
  picked: null, // the part whose card is open
};

export const assembly = new THREE.Group();
scene.add(assembly);

export const partById = (id) => G.product.parts.find((p) => p.id === id);
export const rootOf = (id) => {
  let p = partById(id);
  while (p.parent) p = partById(p.parent);
  return p.id;
};

export const holderOf = (p) => (p.parent ? G.objects[p.parent] : assembly);
export const holderMatrix = (p) => (p.parent ? G.relM[p.id] : G.localM[p.id]);
export const isPlaced = (id) => G.objects[id].parent !== scene;

// The first flip at or after step i: the assembly keeps its orientation until then.
export const nextFlip = (i) => {
  const n = G.product.steps.findIndex((s, k) => k >= i && s.type === 'flip');
  return n < 0 ? G.product.steps.length : n;
};

export const X_AXIS = new V3(1, 0, 0);
export const Z_AXIS = new V3(0, 0, 1);
export const turnQ = (axis, degrees) => new Q().setFromAxisAngle(axis === 'z' ? Z_AXIS : X_AXIS, THREE.MathUtils.degToRad(degrees));

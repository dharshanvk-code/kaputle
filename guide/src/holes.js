// Flat-pack boards come drilled, and the holes are how you match parts. Wherever a dowel, stud,
// screw or cam lock goes into a board, that board gets a hole on that face, so a board lying in
// the pile already shows where its hardware goes and which way. Worked out from the parts'
// positions, not authored. Nails make their own holes, so they're left out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, Q } from './config.js';

// A hole is a dark centre with a rim of the raw board showing, which reads on any finish:
// white, birch or near-black.
const holeMat = new THREE.MeshStandardMaterial({
  color: 0x1c1714, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
});
const rimMat = new THREE.MeshStandardMaterial({
  color: 0xc8a77a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const AXES = ['x', 'y', 'z'];

export function drillHoles(product, objects) {
  const boards = product.parts.filter((p) => p.shape === 'board');
  const discs = {}; // board id -> { holes, rims } geometries, in the board's own frame
  const zAxis = new V3(0, 0, 1);
  for (const h of product.parts) {
    if (!['dowel', 'pin', 'screw'].includes(h.shape)) continue;
    const dir = new V3(...h.dir).normalize();
    const start = new V3(...h.pos);
    if (h.shape !== 'screw') start.addScaledVector(dir, -h.length / 2); // centred parts
    const radius = h.shape === 'screw' ? h.radius * 1.4 : h.radius * 1.12;
    for (const b of boards) {
      // Where the part's axis enters and leaves the board's box (boards sit square in the product).
      const c = new V3(...b.pos);
      const half = new V3(...b.size).multiplyScalar(0.5);
      let tIn = -Infinity;
      let tOut = Infinity;
      let nIn = null;
      let nOut = null;
      let misses = false;
      for (const a of AXES) {
        const o = start[a] - c[a];
        const d = dir[a];
        if (Math.abs(d) < 1e-6) {
          if (Math.abs(o) > half[a] - 0.01) misses = true;
          continue;
        }
        const sign = d > 0 ? 1 : -1;
        const enter = (-sign * half[a] - o) / d;
        const leave = (sign * half[a] - o) / d;
        if (enter > tIn) {
          tIn = enter;
          nIn = new V3().setComponent(AXES.indexOf(a), -sign);
        }
        if (leave < tOut) {
          tOut = leave;
          nOut = new V3().setComponent(AXES.indexOf(a), sign);
        }
      }
      if (misses || Math.min(tOut, h.length) - Math.max(tIn, 0) < 0.15) continue;
      for (const [t, n] of [[tIn, nIn], [tOut, nOut]]) {
        if (t < -0.05 || t > h.length + 0.05) continue; // that face is beyond the part's ends
        const at = start.clone().addScaledVector(dir, t).sub(c).addScaledVector(n, 0.015);
        const place = new THREE.Matrix4().compose(at, new Q().setFromUnitVectors(zAxis, n), new V3(1, 1, 1));
        const rim = Math.max(0.12, radius * 0.35);
        const entry = (discs[b.id] ||= { holes: [], rims: [] });
        entry.holes.push(new THREE.CircleGeometry(radius, 20).applyMatrix4(place));
        // Metal and plastic parts have punched holes, with no raw core to show.
        if (!['steel', 'brass', 'plastic'].includes(b.material)) entry.rims.push(new THREE.RingGeometry(radius * 0.98, radius + rim, 20).applyMatrix4(place));
      }
    }
  }
  for (const [id, { holes, rims }] of Object.entries(discs)) {
    for (const [list, mat] of [[holes, holeMat], [rims, rimMat]]) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.raycast = () => {}; // taps go to the board itself
      objects[id].add(m);
      for (const g of list) g.dispose();
    }
  }
}

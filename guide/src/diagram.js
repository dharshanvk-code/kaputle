// A small line drawing of the finished product with one part filled in, like a manual's
// parts diagram. Drawn once per part into an image and cached.
import * as THREE from 'three';
import { V3 } from './config.js';
import { renderer, viewDir } from './scene.js';
import { G, partById, rootOf } from './state.js';

export const DIAGRAM_W = 460;
export const DIAGRAM_H = 260;
const diagramCache = {};
let diagramTarget = null;

export function diagramFor(id) {
  if (diagramCache[id]) return diagramCache[id];
  const pickedPart = partById(id);
  const focus = pickedPart.shape === 'board' ? id : pickedPart.parent; // hardware: show the board it goes into
  let shot = drawDiagram(G.product.parts, pickedPart, focus);
  // A part hidden inside the finished product (a drawer side) is drawn with just the piece it
  // belongs to (the drawer), so the highlight can be seen.
  const root = rootOf(id);
  if (focus && root !== focus && shot.warm < DIAGRAM_W * DIAGRAM_H * 0.004) {
    shot = drawDiagram(G.product.parts.filter((p) => rootOf(p.id) === root), pickedPart, focus);
  }
  return (diagramCache[id] = shot.url);
}

function drawDiagram(list, pickedPart, focus) {
  const cs = getComputedStyle(document.documentElement);
  const accent = new THREE.Color(cs.getPropertyValue('--accent').trim() || '#d9531c');
  const ink = new THREE.Color(cs.getPropertyValue('--ink-soft').trim() || '#5a636e');
  const paper = new THREE.Color(cs.getPropertyValue('--bg').trim() || '#eceff2');
  const mini = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-1, 2, 1.5);
  mini.add(new THREE.AmbientLight(0xffffff, 1.6), sun);
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const plain = new THREE.MeshLambertMaterial({ color: paper.clone().lerp(new THREE.Color(0xffffff), 0.6), ...offset });
  const lit = new THREE.MeshLambertMaterial({ color: accent, ...offset });
  const line = new THREE.LineBasicMaterial({ color: ink });
  const geos = [];
  const box = new THREE.Box3();
  for (const p of list) {
    if (p.shape !== 'board') continue;
    const geo = new THREE.BoxGeometry(...p.size);
    const edges = new THREE.EdgesGeometry(geo);
    geos.push(geo, edges);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, p.id === focus ? lit : plain), new THREE.LineSegments(edges, line));
    G.finalM[p.id].decompose(g.position, g.quaternion, g.scale);
    mini.add(g);
    box.expandByObject(g);
  }
  if (pickedPart.shape !== 'board') {
    // Mark the spot where this piece of hardware goes.
    const r = Math.max(1.2, box.getSize(new V3()).length() / 32);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12), new THREE.MeshBasicMaterial({ color: 0x15181c, depthTest: false, transparent: true, opacity: 0.85 }));
    dot.renderOrder = 5;
    dot.position.set(...pickedPart.pos);
    geos.push(dot.geometry);
    mini.add(dot);
  }
  const cam = new THREE.PerspectiveCamera(30, DIAGRAM_W / DIAGRAM_H, 1, 5000);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vf = THREE.MathUtils.degToRad(15);
  const hf = Math.atan(Math.tan(vf) * cam.aspect);
  cam.position.copy(sphere.center).addScaledVector(viewDir(32, 26), (sphere.radius / Math.sin(Math.min(vf, hf))) * 0.74);
  cam.lookAt(sphere.center);
  diagramTarget ||= new THREE.WebGLRenderTarget(DIAGRAM_W, DIAGRAM_H, { samples: 4 });
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const clear = new THREE.Color();
  renderer.getClearColor(clear);
  const clearAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(diagramTarget);
  renderer.setClearColor(paper, 1);
  renderer.clear();
  renderer.render(mini, cam);
  const px = new Uint8Array(DIAGRAM_W * DIAGRAM_H * 4);
  renderer.readRenderTargetPixels(diagramTarget, 0, 0, DIAGRAM_W, DIAGRAM_H, px);
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(clear, clearAlpha);
  for (const g of geos) g.dispose();
  // How much of the highlight made it into the picture: the accent is the only warm colour in it.
  let warm = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] - px[i + 2] > 60) warm++;
  // Render targets come out upside down and in linear colour; flip and convert for the <img>.
  const c = document.createElement('canvas');
  c.width = DIAGRAM_W;
  c.height = DIAGRAM_H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(DIAGRAM_W, DIAGRAM_H);
  const toSrgb = (v) => {
    const l = v / 255;
    return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
  };
  for (let y = 0; y < DIAGRAM_H; y++) {
    for (let x = 0; x < DIAGRAM_W * 4; x += 4) {
      const src = (DIAGRAM_H - 1 - y) * DIAGRAM_W * 4 + x;
      const dst = y * DIAGRAM_W * 4 + x;
      img.data[dst] = toSrgb(px[src]);
      img.data[dst + 1] = toSrgb(px[src + 1]);
      img.data[dst + 2] = toSrgb(px[src + 2]);
      img.data[dst + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: c.toDataURL(), warm };
}

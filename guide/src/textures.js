// Procedural canvas textures, so the guide ships with no image assets.
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function speckle(g, w, h, count, color, maxAlpha) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = color.replace('A', (Math.random() * maxAlpha).toFixed(3));
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// Pale birch plywood face: fine, low-contrast straight grain.
export function birchTexture() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#ead8b8';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 512;
    const wobble = 2 + Math.random() * 5;
    const phase = Math.random() * 6;
    g.strokeStyle = Math.random() < 0.6
      ? `rgba(150,110,60,${0.03 + Math.random() * 0.07})`
      : `rgba(255,245,225,${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 0.5 + Math.random() * 1.6;
    g.beginPath();
    for (let y = 0; y <= 512; y += 16) {
      const px = x + Math.sin(y * 0.012 + phase) * wobble;
      y === 0 ? g.moveTo(px, y) : g.lineTo(px, y);
    }
    g.stroke();
  }
  speckle(g, 512, 512, 2500, 'rgba(120,80,40,A)', 0.08);
  return toTexture(c);
}

// Light oak floorboards with seams between planks.
export function plankTexture() {
  const [c, g] = makeCanvas(1024, 1024);
  const rowH = 128;
  for (let row = 0; row < 1024 / rowH; row++) {
    let x = -Math.random() * 400;
    while (x < 1024) {
      const len = 320 + Math.random() * 360;
      const tone = 196 + Math.random() * 22;
      g.fillStyle = `rgb(${tone},${tone - 26},${tone - 58})`;
      g.fillRect(x, row * rowH, len, rowH);
      for (let i = 0; i < 18; i++) {
        const y = row * rowH + Math.random() * rowH;
        g.strokeStyle = `rgba(120,85,45,${0.04 + Math.random() * 0.08})`;
        g.lineWidth = 0.6 + Math.random() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (Math.random() - 0.5) * 6); g.stroke();
      }
      g.fillStyle = 'rgba(70,45,20,0.35)';
      g.fillRect(x, row * rowH, 2, rowH);
      x += len;
    }
    g.fillStyle = 'rgba(70,45,20,0.35)';
    g.fillRect(0, row * rowH, 1024, 2);
  }
  return toTexture(c, { repeat: [1, 1] });
}

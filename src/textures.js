// Procedural canvas textures, so the project ships with no image assets.
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

// Self-healing cutting mat with a 1 cm grid and ruler numbers. One world unit = 1 cm.
export function cuttingMatTexture(wCm, hCm) {
  const px = 40;
  const [c, g] = makeCanvas(wCm * px, hCm * px);
  g.fillStyle = '#2b5747';
  g.fillRect(0, 0, c.width, c.height);
  speckle(g, c.width, c.height, 14000, 'rgba(0,0,0,A)', 0.12);
  speckle(g, c.width, c.height, 6000, 'rgba(255,255,255,A)', 0.05);

  for (let x = 0; x <= wCm; x++) {
    const major = x % 5 === 0;
    g.strokeStyle = major ? 'rgba(214,240,226,0.5)' : 'rgba(214,240,226,0.2)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke();
  }
  for (let y = 0; y <= hCm; y++) {
    const major = y % 5 === 0;
    g.strokeStyle = major ? 'rgba(214,240,226,0.5)' : 'rgba(214,240,226,0.2)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke();
  }
  // 45° guide lines, like a real mat
  g.strokeStyle = 'rgba(214,240,226,0.12)';
  g.lineWidth = 1.5;
  for (let k = -hCm; k < wCm; k += 10) {
    g.beginPath(); g.moveTo(k * px, c.height); g.lineTo((k + hCm) * px, 0); g.stroke();
  }
  g.fillStyle = 'rgba(226,244,234,0.75)';
  g.font = `600 ${Math.round(px * 0.42)}px "IBM Plex Mono", ui-monospace, monospace`;
  for (let x = 5; x < wCm; x += 5) g.fillText(String(x), x * px + 5, c.height - 10);
  for (let y = 5; y < hCm; y += 5) g.fillText(String(y), 6, c.height - y * px - 6);
  g.font = `600 ${Math.round(px * 0.34)}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillText('CM', c.width - px * 1.6, c.height - 10);
  return toTexture(c);
}

export function woodTexture() {
  const [c, g] = makeCanvas(1024, 512);
  g.fillStyle = '#9a6a3c';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 160; i++) {
    const y0 = Math.random() * c.height;
    const amp = 2 + Math.random() * 8;
    const freq = 0.004 + Math.random() * 0.01;
    const phase = Math.random() * 10;
    g.strokeStyle = Math.random() < 0.5
      ? `rgba(60,34,14,${0.05 + Math.random() * 0.18})`
      : `rgba(220,170,110,${0.04 + Math.random() * 0.1})`;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  speckle(g, c.width, c.height, 5000, 'rgba(40,20,5,A)', 0.15);
  return toTexture(c, { repeat: [2, 1] });
}

// Hardboard pegboard: 8 × 8 holes per tile.
export function pegboardTexture() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#a97f55';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 9000, 'rgba(60,35,15,A)', 0.14);
  speckle(g, 512, 512, 4000, 'rgba(255,230,190,A)', 0.08);
  const step = 64;
  for (let y = step / 2; y < 512; y += step) {
    for (let x = step / 2; x < 512; x += step) {
      g.fillStyle = 'rgba(255,235,205,0.25)';
      g.beginPath(); g.arc(x + 1, y + 1.5, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2e2014';
      g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    }
  }
  return toTexture(c, { repeat: [1, 1] });
}

// Diamond knurl pattern used as a bump map on the grip.
export function knurlTexture() {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#000';
  g.lineWidth = 7;
  for (let k = -128; k <= 256; k += 32) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke();
  }
  return toTexture(c, { srgb: false, repeat: [1, 1] });
}

// Battery wrapper. Canvas x wraps around the cell; canvas top is the + end.
export function batteryLabelTexture() {
  const W = 1024, H = 512;
  const [c, g] = makeCanvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#16243f');
  grad.addColorStop(1, '#0f1a30');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f0b429';
  g.fillRect(0, 26, W, 54);
  g.fillStyle = '#e8edf5';
  g.fillRect(0, H - 34, W, 10);

  const drawLabel = (cx) => {
    g.save();
    g.translate(cx, H / 2 + 20);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = '800 64px "Bricolage Grotesque", "Arial Black", sans-serif';
    g.fillText('KAPUT CELL', -10, -18);
    g.font = '600 34px "IBM Plex Mono", ui-monospace, monospace';
    g.fillStyle = '#f0b429';
    g.fillText('1.5 V · SIZE C', -10, 46);
    g.fillStyle = '#ffffff';
    g.font = '700 70px "IBM Plex Sans", Arial, sans-serif';
    g.fillText('+', 176, 14);
    g.fillText('−', -196, 14);
    g.restore();
  };
  drawLabel(W / 2);
  drawLabel(0);
  drawLabel(W);
  return toTexture(c);
}

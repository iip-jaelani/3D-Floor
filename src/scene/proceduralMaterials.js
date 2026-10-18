import * as THREE from 'three';

const SIZE = 512;
const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

function noise(ctx, rand, amount, count = 6000) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${amount})`;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, 1 + rand() * 2, 1 + rand() * 2);
  }
}

const DRAWERS = {
  planks({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#b0b0b0';
    h.fillRect(0, 0, SIZE, SIZE);
    const rows = 8;
    const rh = SIZE / rows;
    for (let i = 0; i < rows; i++) {
      const tint = rand() * 0.18;
      c.fillStyle = `rgba(0,0,0,${tint})`;
      c.fillRect(0, i * rh, SIZE, rh);
      c.fillStyle = stripe;
      c.globalAlpha = 0.13;
      for (let g = 0; g < 14; g++) c.fillRect(0, i * rh + rand() * rh, SIZE, 0.6 + rand() * 1.6);
      c.globalAlpha = 1;
      c.fillStyle = stripe;
      c.fillRect(0, i * rh, SIZE, 2);
      h.fillStyle = '#000';
      h.fillRect(0, i * rh, SIZE, 2);
      const jx = rand() * SIZE;
      c.fillRect(jx, i * rh, 2, rh);
      h.fillRect(jx, i * rh, 2, rh);
    }
  },
  tiles({ c, h, rand, base, stripe }) {
    const n = 4;
    const t = SIZE / n;
    c.fillStyle = stripe;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#000';
    h.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const shade = Math.floor(rand() * 14) - 7;
        c.fillStyle = shiftHex(base, shade);
        c.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
        h.fillStyle = '#c8c8c8';
        h.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      }
    }
  },
  marble({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#9a9a9a';
    h.fillRect(0, 0, SIZE, SIZE);
    c.strokeStyle = stripe;
    for (let v = 0; v < 14; v++) {
      c.globalAlpha = 0.15 + rand() * 0.25;
      c.lineWidth = 0.6 + rand() * 1.8;
      c.beginPath();
      let x = rand() * SIZE;
      let y = 0;
      c.moveTo(x, y);
      while (y < SIZE) {
        x += (rand() - 0.5) * 40;
        y += 18 + rand() * 24;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = stripe;
    [0, SIZE / 2].forEach((p) => {
      c.fillRect(p, 0, 2, SIZE);
      c.fillRect(0, p, SIZE, 2);
      h.fillStyle = '#000';
      h.fillRect(p, 0, 2, SIZE);
      h.fillRect(0, p, SIZE, 2);
    });
  },
  granite({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#909090';
    h.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = rand() > 0.5 ? stripe : '#ffffff';
      c.globalAlpha = 0.1 + rand() * 0.25;
      c.fillRect(rand() * SIZE, rand() * SIZE, 1 + rand() * 3, 1 + rand() * 3);
    }
    c.globalAlpha = 1;
    noise(h, rand, 0.12, 4000);
  },
  concrete({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#8a8a8a';
    h.fillRect(0, 0, SIZE, SIZE);
    noise(c, rand, 0.06, 9000);
    noise(h, rand, 0.18, 9000);
    c.fillStyle = stripe;
    for (let i = 0; i < 6; i++) c.fillRect(rand() * SIZE, rand() * SIZE, 20 + rand() * 60, 1);
  },
  plaster({ c, h, rand, base }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#909090';
    h.fillRect(0, 0, SIZE, SIZE);
    noise(c, rand, 0.035, 12000);
    noise(h, rand, 0.22, 12000);
  },
  brick({ c, h, rand, base, stripe }) {
    c.fillStyle = stripe;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#000';
    h.fillRect(0, 0, SIZE, SIZE);
    const rows = 8;
    const bh = SIZE / rows;
    const bw = SIZE / 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k < 5; k++) {
        const x = k * bw + off;
        c.fillStyle = shiftHex(base, Math.floor(rand() * 30) - 15);
        c.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        h.fillStyle = '#d0d0d0';
        h.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    noise(c, rand, 0.08, 6000);
  },
  stone({ c, h, rand, base, stripe }) {
    c.fillStyle = stripe;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#000';
    h.fillRect(0, 0, SIZE, SIZE);
    let y = 0;
    while (y < SIZE) {
      const rowH = 56 + rand() * 40;
      let x = -rand() * 60;
      while (x < SIZE) {
        const w = 70 + rand() * 90;
        c.fillStyle = shiftHex(base, Math.floor(rand() * 40) - 20);
        c.fillRect(x + 3, y + 3, w - 6, rowH - 6);
        h.fillStyle = `rgb(${150 + Math.floor(rand() * 90)},0,0)`.replace(/rgb\((\d+),0,0\)/, (_, v) => `rgb(${v},${v},${v})`);
        h.fillRect(x + 3, y + 3, w - 6, rowH - 6);
        x += w;
      }
      y += rowH;
    }
    noise(c, rand, 0.1, 6000);
  },
  roofTiles({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#000';
    h.fillRect(0, 0, SIZE, SIZE);
    const rows = 10;
    const th = SIZE / rows;
    const cols = 8;
    const tw = SIZE / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = -1; k <= cols; k++) {
        const x = k * tw + (r % 2 ? tw / 2 : 0);
        const g = c.createLinearGradient(x, 0, x + tw, 0);
        g.addColorStop(0, shiftHex(base, -22));
        g.addColorStop(0.5, shiftHex(base, 12));
        g.addColorStop(1, shiftHex(base, -22));
        c.fillStyle = g;
        c.fillRect(x + 1, r * th, tw - 2, th - 1);
        const gh = h.createLinearGradient(x, 0, x + tw, 0);
        gh.addColorStop(0, '#303030');
        gh.addColorStop(0.5, '#f0f0f0');
        gh.addColorStop(1, '#303030');
        h.fillStyle = gh;
        h.fillRect(x + 1, r * th, tw - 2, th - 1);
        c.fillStyle = stripe;
        c.globalAlpha = 0.35;
        c.fillRect(x + 1, r * th + th - 4, tw - 2, 3);
        c.globalAlpha = 1;
      }
    }
    noise(c, rand, 0.05, 5000);
  },
  metalRoof({ c, h, rand, base, stripe }) {
    c.fillStyle = base;
    c.fillRect(0, 0, SIZE, SIZE);
    h.fillStyle = '#000';
    h.fillRect(0, 0, SIZE, SIZE);
    const ribs = 8;
    const w = SIZE / ribs;
    for (let i = 0; i < ribs; i++) {
      const gr = h.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      gr.addColorStop(0, '#202020');
      gr.addColorStop(0.5, '#ffffff');
      gr.addColorStop(1, '#202020');
      h.fillStyle = gr;
      h.fillRect(i * w, 0, w, SIZE);
      c.fillStyle = stripe;
      c.globalAlpha = 0.18;
      c.fillRect(i * w + w * 0.45, 0, w * 0.1, SIZE);
      c.globalAlpha = 1;
    }
    noise(c, rand, 0.04, 4000);
  },
};

function shiftHex(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.min(255, Math.max(0, v));
  const r = clamp((n >> 16) + delta);
  const g = clamp(((n >> 8) & 255) + delta);
  const b = clamp((n & 255) + delta);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function normalFromHeight(heightCanvas, strength) {
  const ctx = heightCanvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const out = canvas();
  const octx = out.getContext('2d');
  const image = octx.createImageData(SIZE, SIZE);
  const at = (x, y) => data[(((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)) * 4] / 255;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * SIZE + x) * 4;
      image.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  octx.putImageData(image, 0, 0);
  return out;
}

export const PROCEDURAL = {
  oak: { drawer: 'planks', base: '#8c6239', stripe: '#593a1e', tile: 2, roughness: 0.55, normalStrength: 1.2 },
  walnut: { drawer: 'planks', base: '#4a3525', stripe: '#261910', tile: 2, roughness: 0.5, normalStrength: 1.2 },
  marble: { drawer: 'tiles', base: '#e2e8f0', stripe: '#b8c2d0', tile: 2.4, roughness: 0.25, normalStrength: 0.8 },
  marblewhite: { drawer: 'marble', base: '#f1f1ee', stripe: '#8e8e8a', tile: 2.4, roughness: 0.18, normalStrength: 0.4 },
  ceramic: { drawer: 'tiles', base: '#d8d3c8', stripe: '#8d8a82', tile: 2.4, roughness: 0.3, normalStrength: 1.4 },
  granite: { drawer: 'granite', base: '#3a3a3d', stripe: '#9a9aa0', tile: 1.5, roughness: 0.28, normalStrength: 0.5 },
  concrete: { drawer: 'concrete', base: '#a3a3a0', stripe: '#7b7b78', tile: 2, roughness: 0.85, normalStrength: 1.0 },
  plaster: { drawer: 'plaster', base: '#ffffff', stripe: '#ffffff', tile: 1.5, roughness: 0.9, normalStrength: 0.9, tint: true },
  brick: { drawer: 'brick', base: '#b5573b', stripe: '#cfc7bb', tile: 1.0, roughness: 0.85, normalStrength: 2.0 },
  wallconcrete: { drawer: 'concrete', base: '#c9c9c6', stripe: '#9d9d9a', tile: 1.5, roughness: 0.9, normalStrength: 1.0, tint: true },
  stone: { drawer: 'stone', base: '#8f877b', stripe: '#4d473f', tile: 1.2, roughness: 0.9, normalStrength: 2.4 },
  tiles: { drawer: 'roofTiles', base: '#e8e8e8', stripe: '#9a9a9a', tile: 1.0, roughness: 0.8, normalStrength: 2.6, tint: true },
  metal: { drawer: 'metalRoof', base: '#f0f0f0', stripe: '#b5b5b5', tile: 0.9, roughness: 0.45, normalStrength: 1.6, tint: true },
};

export const WALL_TEXTURES = [
  ['', 'Polos'],
  ['plaster', 'Plester halus'],
  ['brick', 'Bata merah'],
  ['wallconcrete', 'Beton ekspos'],
  ['stone', 'Batu alam'],
];

export function getTextureSet(id) {
  const spec = PROCEDURAL[id];
  if (!spec) return null;
  if (cache.has(id)) return cache.get(id);

  const colorCanvas = canvas();
  const heightCanvas = canvas();
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  DRAWERS[spec.drawer]({
    c: colorCanvas.getContext('2d'),
    h: heightCanvas.getContext('2d'),
    rand: rng(seed + 7),
    base: spec.base,
    stripe: spec.stripe,
  });

  const make = (source, srgb) => {
    const texture = new THREE.CanvasTexture(source);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(1 / spec.tile, 1 / spec.tile);
    return texture;
  };
  const set = {
    map: make(colorCanvas, true),
    normalMap: make(normalFromHeight(heightCanvas, spec.normalStrength), false),
    spec,
  };
  cache.set(id, set);
  return set;
}

export function applyTextureSet(material, id) {
  const set = getTextureSet(id);
  if (!set) return material;
  material.map = set.map;
  material.normalMap = set.normalMap;
  material.normalScale = new THREE.Vector2(1, 1);
  material.roughness = set.spec.roughness;
  material.userData.tile = set.spec.tile;
  material.needsUpdate = true;
  return material;
}

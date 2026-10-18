import * as THREE from 'three';

let fabricBump = null;

function getFabricBump() {
  if (fabricBump) return fabricBump;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 18 : -18;
      const value = 128 + weave + (Math.random() - 0.5) * 50;
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  fabricBump = new THREE.CanvasTexture(canvas);
  fabricBump.wrapS = THREE.RepeatWrapping;
  fabricBump.wrapT = THREE.RepeatWrapping;
  fabricBump.repeat.set(3, 3);
  return fabricBump;
}

export function fabricMaterial(color, { roughness = 0.9 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    bumpMap: getFabricBump(),
    bumpScale: 0.6,
  });
}

export function createScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 256, 144);
  gradient.addColorStop(0, '#13233b');
  gradient.addColorStop(1, '#04070d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 144);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(110, 0);
  ctx.lineTo(0, 62);
  ctx.closePath();
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

import * as THREE from 'three';

const SIZE = 512;

export function createRugTexture(baseHex) {
  const base = new THREE.Color(baseHex);
  const light = `#${base.clone().offsetHSL(0, 0, 0.1).getHexString()}`;
  const dark = `#${base.clone().offsetHSL(0, 0, -0.12).getHexString()}`;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = -SIZE; i < SIZE * 2; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + SIZE, SIZE);
    ctx.moveTo(i, SIZE);
    ctx.lineTo(i + SIZE, 0);
    ctx.stroke();
  }

  const frame = (inset, color, lineWidth) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(inset, inset, SIZE - inset * 2, SIZE - inset * 2);
  };
  frame(16, dark, 18);
  frame(44, light, 8);
  frame(60, dark, 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

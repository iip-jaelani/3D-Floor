import * as THREE from 'three';
import { FLOOR_OPTIONS } from '../config.js';

const SIZE = 512;
const PLANKS = 8;
const cache = new Map();

function drawPlanks(baseHex, stripeHex) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = 2;
  const plankH = SIZE / PLANKS;

  for (let i = 0; i < PLANKS; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * plankH);
    ctx.lineTo(SIZE, i * plankH);
    ctx.stroke();

    const jointX = ((i * 173) % 400) + 50;
    ctx.beginPath();
    ctx.moveTo(jointX, i * plankH);
    ctx.lineTo(jointX, (i + 1) * plankH);
    ctx.stroke();

    ctx.fillStyle = stripeHex;
    ctx.globalAlpha = 0.12;
    for (let s = 0; s < 12; s++) {
      ctx.fillRect(0, i * plankH + Math.random() * plankH, SIZE, Math.random() * 4);
    }
    ctx.globalAlpha = 1;
  }
  return canvas;
}

export function getFloorTexture(id) {
  if (cache.has(id)) return cache.get(id);

  const option = FLOOR_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`Jenis lantai tidak dikenal: ${id}`);

  const texture = new THREE.CanvasTexture(drawPlanks(option.base, option.stripe));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.5, 0.5);
  cache.set(id, texture);
  return texture;
}

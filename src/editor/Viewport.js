const MIN_SCALE = 15;
const MAX_SCALE = 400;

export class Viewport {
  scale = 80;
  originX = 0;
  originY = 0;
  width = 0;
  height = 0;

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  toScreen([x, z]) {
    return [this.originX + x * this.scale, this.originY + z * this.scale];
  }

  toWorld(sx, sy) {
    return [(sx - this.originX) / this.scale, (sy - this.originY) / this.scale];
  }

  panBy(dx, dy) {
    this.originX += dx;
    this.originY += dy;
  }

  zoomAt(sx, sy, factor) {
    const [wx, wz] = this.toWorld(sx, sy);
    this.scale = Math.min(Math.max(this.scale * factor, MIN_SCALE), MAX_SCALE);
    this.originX = sx - wx * this.scale;
    this.originY = sy - wz * this.scale;
  }

  fit(bounds, { left = 90, right = 90, top = 90, bottom = 90 } = {}) {
    const w = Math.max(bounds.maxX - bounds.minX, 1);
    const d = Math.max(bounds.maxZ - bounds.minZ, 1);
    const availW = Math.max(this.width - left - right, 100);
    const availH = Math.max(this.height - top - bottom, 100);

    this.scale = Math.min(Math.max(Math.min(availW / w, availH / d), MIN_SCALE), MAX_SCALE);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    this.originX = left + availW / 2 - cx * this.scale;
    this.originY = top + availH / 2 - cz * this.scale;
  }
}

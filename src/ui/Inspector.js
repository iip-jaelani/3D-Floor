import { FURNITURE_COLORS } from '../config.js';
import { byId } from './dom.js';

export class Inspector {
  #item = null;
  #stopListening = null;

  constructor({ selection, manager, status, onDelete }) {
    this.selection = selection;
    this.manager = manager;
    this.status = status;
    this.furnitureOnly = document.querySelectorAll('[data-furniture-only]');

    this.panel = byId('inspector-panel');
    this.nameEl = byId('selected-name');
    this.posEl = byId('selected-pos');
    this.rotEl = byId('selected-rot');
    this.slider = byId('rot-slider');
    this.swatchesEl = byId('material-swatches');

    this.#renderSwatches();

    this.slider.addEventListener('input', (e) => this.#item?.setRotationDeg(parseFloat(e.target.value)));
    byId('btn-deselect').addEventListener('click', () => selection.clear());
    byId('btn-delete').addEventListener('click', () => this.#item && onDelete(this.#item));
    byId('btn-duplicate').addEventListener('click', () => {
      if (this.#item) selection.select(manager.duplicate(this.#item));
    });

    selection.on('change', (item) => this.#show(item));
    this.#show(selection.current);
  }

  #show(item) {
    this.#stopListening?.();
    this.#item = item;

    this.panel.classList.toggle('hidden', !item);
    byId('inspector-empty').classList.toggle('hidden', !!item);

    if (!item) {
      this.status.reset();
      return;
    }

    const movable = item.kind !== 'decor';
    this.furnitureOnly.forEach((el) => el.classList.toggle('hidden', !movable));

    this.#stopListening = item.on('transform', () => this.#refresh());
    this.status.set(movable ? `Terpilih: ${item.name} — Drag untuk geser posisi` : `Terpilih: ${item.name}`);
    this.nameEl.textContent = item.name;
    if (movable) this.#refresh();
  }

  #refresh() {
    const item = this.#item;
    if (!item) return;

    this.posEl.textContent = `${item.x.toFixed(2)}m, ${item.z.toFixed(2)}m`;
    this.rotEl.textContent = `${item.rotationDeg}°`;
    if (document.activeElement !== this.slider) this.slider.value = item.rotationDeg;

    this.swatchesEl.querySelectorAll('.color-swatch').forEach((swatch) => {
      swatch.classList.toggle('selected', swatch.dataset.color === item.color);
    });
  }

  #renderSwatches() {
    FURNITURE_COLORS.forEach(({ hex, title }) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = hex;
      swatch.dataset.color = hex;
      swatch.title = title;
      swatch.addEventListener('click', () => this.#item?.setColor(hex));
      this.swatchesEl.appendChild(swatch);
    });
  }
}

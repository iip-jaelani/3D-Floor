import { byId } from './dom.js';

const LAYERS = [
  ['walls', 'Tembok', 'fa-solid fa-minus', 'Garis tembok & ukurannya'],
  ['rooms', 'Ruangan (lantai)', 'fa-regular fa-square', 'Lantai, nama, dan luas ruangan'],
  ['openings', 'Pintu & jendela', 'fa-solid fa-door-open', 'Pintu, jendela, dan cekungan'],
  ['decor', 'Gorden & karpet', 'fa-solid fa-swatchbook', 'Dekor yang menempel di lantai'],
  ['yards', 'Halaman / taman', 'fa-solid fa-tree', 'Rumput, paving, kolam, dan tanaman'],
  ['stairs', 'Tangga', 'fa-solid fa-stairs', 'Tangga lurus dan arah naiknya'],
  ['roofs', 'Atap & kanopi', 'fa-solid fa-house-chimney', 'Garis atap, bubungan, dan kanopi'],
  ['furniture', 'Furnitur', 'fa-solid fa-couch', 'Jejak furnitur di denah'],
];

export function setupLayerPanel({ editor }) {
  const container = byId('layer-list');

  const render = () => {
    container.replaceChildren();
    LAYERS.forEach(([name, title, icon, hint]) => {
      const state = editor.layers[name];
      const row = document.createElement('div');
      row.className = `layer-row ${state.visible ? '' : 'layer-off'}`;
      row.title = hint;

      const eye = document.createElement('button');
      eye.className = `layer-btn ${state.visible ? 'on' : ''}`;
      eye.title = state.visible ? 'Sembunyikan' : 'Tampilkan';
      eye.innerHTML = `<i class="fa-solid ${state.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
      eye.addEventListener('click', () => editor.setLayer(name, { visible: !state.visible }));

      const lock = document.createElement('button');
      lock.className = `layer-btn ${state.locked ? 'on warn' : ''}`;
      lock.title = state.locked ? 'Buka kunci (bisa dipilih)' : 'Kunci (tidak bisa dipilih)';
      lock.innerHTML = `<i class="fa-solid ${state.locked ? 'fa-lock' : 'fa-lock-open'}"></i>`;
      lock.addEventListener('click', () => editor.setLayer(name, { locked: !state.locked }));
      if (name === 'furniture') {
        lock.disabled = true;
        lock.classList.add('opacity-30');
      }

      const label = document.createElement('span');
      label.className = 'layer-name';
      label.innerHTML = `<i class="${icon}"></i>`;
      label.append(title);

      row.append(eye, lock, label);
      container.appendChild(row);
    });
  };

  editor.on('layers', render);
  render();
}

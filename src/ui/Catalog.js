import { listCatalog } from '../furniture/registry.js';
import { byId } from './dom.js';

const SPAWN_SPREAD = 1.2;

export function setupCatalog({ manager, selection, modals, spawnPoint }) {
  const grid = byId('catalog-grid');

  listCatalog().forEach(({ type, catalog }) => {
    const button = document.createElement('button');
    button.className =
      'p-3 rounded-xl bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-400/50 transition flex flex-col items-center gap-2';
    button.innerHTML = `<i class="${catalog.icon} text-xl ${catalog.iconClass}"></i><span>${catalog.label}</span>`;

    button.addEventListener('click', () => {
      const [cx, cz] = spawnPoint();
      const position = [cx + (Math.random() - 0.5) * SPAWN_SPREAD, cz + (Math.random() - 0.5) * SPAWN_SPREAD];
      selection.select(manager.create(type, { position }));
      modals.hide('catalog-modal');
    });

    grid.appendChild(button);
  });
}

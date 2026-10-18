import { byId } from './dom.js';

const CONFIRM_MS = 3000;

export function setupFloorTabs({ plan }) {
  const container = byId('floor-tabs');
  let confirmingId = null;
  let confirmTimer = 0;

  const render = () => {
    container.replaceChildren();
    const floors = [...plan.floors].sort((a, b) => b.level - a.level);

    floors.forEach((floor) => {
      const button = document.createElement('button');
      button.className = `floor-tab ${floor.id === plan.activeFloorId ? 'active' : ''}`;
      button.innerHTML = '<i class="fa-solid fa-layer-group text-[11px]"></i>';
      button.append(floor.name);
      button.addEventListener('click', () => plan.setActiveFloor(floor.id));
      container.appendChild(button);
    });

    const add = document.createElement('button');
    add.className = 'floor-tab';
    add.innerHTML = '<i class="fa-solid fa-plus text-[11px]"></i> Tambah lantai';
    add.addEventListener('click', () => {
      plan.checkpoint();
      plan.setActiveFloor(plan.addFloor().id);
    });
    container.appendChild(add);

    if (plan.floors.length > 1) {
      const remove = document.createElement('button');
      const confirming = confirmingId === plan.activeFloorId;
      remove.className = 'floor-tab text-rose-300';
      remove.innerHTML = confirming
        ? '<i class="fa-solid fa-triangle-exclamation text-[11px]"></i> Klik lagi untuk hapus'
        : '<i class="fa-regular fa-trash-can text-[11px]"></i> Hapus lantai ini';
      remove.addEventListener('click', () => {
        if (!confirming) {
          confirmingId = plan.activeFloorId;
          clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => {
            confirmingId = null;
            render();
          }, CONFIRM_MS);
          render();
          return;
        }
        confirmingId = null;
        plan.checkpoint();
        plan.removeFloor(plan.activeFloorId);
      });
      container.appendChild(remove);
    }
  };

  plan.on('change', render);
  plan.on('floor', () => {
    confirmingId = null;
    render();
  });
  render();
}

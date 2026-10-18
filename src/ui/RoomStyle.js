import { FLOOR_OPTIONS, WALL_COLORS } from '../config.js';
import { byId } from './dom.js';

export function setupRoomStyle({ plan }) {
  const floors = byId('floor-options');
  FLOOR_OPTIONS.forEach(({ id, label, buttonClass }) => {
    const button = document.createElement('button');
    button.className = `py-2 px-3 rounded-lg ${buttonClass}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      plan.checkpoint();
      plan.setFloorMaterial(plan.activeFloorId, id);
    });
    floors.appendChild(button);
  });

  const walls = byId('wall-options');
  WALL_COLORS.forEach(({ hex, label, textClass }) => {
    const button = document.createElement('button');
    button.className = `py-1.5 rounded-lg border border-white/20 font-medium ${textClass}`;
    button.style.background = hex;
    button.textContent = label;
    button.addEventListener('click', () => {
      plan.checkpoint();
      plan.setWallColor(hex);
    });
    walls.appendChild(button);
  });
}

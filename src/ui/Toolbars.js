import { FURNITURE_COLORS, ROTATE_STEP_DEG, THEMES } from '../config.js';
import { VIEW_MODES } from '../scene/House3D.js';
import { byId } from './dom.js';

const VIEW_MODE_LABELS = { cutaway: 'Potongan', full: 'Tembok Penuh', low: 'Tembok Rendah' };

export function setupTopBar({ engine, lighting, dimensions, editor, house }) {
  const dimButton = byId('btn-dimensions');
  dimButton.addEventListener('click', () => {
    const visible = !dimensions.visible;
    dimensions.setVisible(visible);
    editor.setShowDims(visible);
    dimButton.classList.toggle('active', visible);
  });

  const wallLabel = byId('text-wallmode');
  byId('btn-wallmode').addEventListener('click', () => {
    const next = VIEW_MODES[(VIEW_MODES.indexOf(house.viewMode) + 1) % VIEW_MODES.length];
    house.setViewMode(next);
    wallLabel.textContent = VIEW_MODE_LABELS[next];
  });

  const realisticButton = byId('btn-realistic');
  const applyRealistic = (on) => {
    engine.setRealistic(on);
    realisticButton.classList.toggle('active', on);
    try {
      localStorage.setItem('floor-studio:realistic', on ? '1' : '0');
    } catch {
    }
  };
  realisticButton.addEventListener('click', () => applyRealistic(!engine.realistic));
  let savedRealistic = true;
  try {
    savedRealistic = localStorage.getItem('floor-studio:realistic') !== '0';
  } catch {
  }
  applyRealistic(savedRealistic);

  const roofButton = byId('btn-roofs');
  roofButton.addEventListener('click', () => {
    house.setRoofsVisible(!house.roofsVisible);
    roofButton.classList.toggle('active', house.roofsVisible);
  });

  const icon = byId('icon-daynight');
  const label = byId('text-daynight');
  byId('btn-daynight').addEventListener('click', () => {
    const { ui } = THEMES[lighting.toggle()];
    icon.className = ui.icon;
    label.textContent = ui.label;
  });

  byId('btn-reset-cam').addEventListener('click', () => engine.resetCamera());
}

export function setupDock({ selection, status, modals }) {
  let colorIndex = 0;

  const requireSelection = (message, action) => () => {
    const item = selection.current;
    if (!item) return status.set(message);
    action(item);
  };

  byId('dock-rotate').addEventListener(
    'click',
    requireSelection('Pilih salah satu furnitur terlebih dahulu untuk memutar!', (item) =>
      item.rotateByDeg(ROTATE_STEP_DEG),
    ),
  );

  byId('dock-material').addEventListener(
    'click',
    requireSelection('Pilih furnitur dulu untuk mengganti warna material!', (item) => {
      colorIndex = (colorIndex + 1) % FURNITURE_COLORS.length;
      item.setColor(FURNITURE_COLORS[colorIndex].hex);
    }),
  );

  byId('dock-catalog').addEventListener('click', () => modals.toggle('catalog-modal'));
  byId('dock-walls').addEventListener('click', () => modals.toggle('room-style-modal'));
}

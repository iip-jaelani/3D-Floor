import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/main.css';

import houseData from './data/house.json';
import { Engine } from './core/Engine.js';
import { Plan } from './plan/Plan.js';
import { loadProject } from './plan/projectStorage.js';
import { setupAutosave } from './plan/autosave.js';
import { polygonArea, polygonCentroid } from './plan/geometry.js';
import { Lighting } from './scene/Lighting.js';
import { House3D } from './scene/House3D.js';
import { DecorItem } from './scene/DecorItem.js';
import { FurnitureManager } from './furniture/FurnitureManager.js';
import { Selection } from './furniture/Selection.js';
import { PointerController } from './interaction/PointerController.js';
import { TourController } from './interaction/TourController.js';
import { DimensionOverlay } from './dimensions/DimensionOverlay.js';
import { PlanEditor } from './editor/PlanEditor.js';
import { byId } from './ui/dom.js';
import { Status } from './ui/Status.js';
import { Modals } from './ui/Modals.js';
import { Inspector } from './ui/Inspector.js';
import { PlanInspector } from './ui/PlanInspector.js';
import { setupCatalog } from './ui/Catalog.js';
import { setupRoomStyle } from './ui/RoomStyle.js';
import { setupTopBar, setupDock } from './ui/Toolbars.js';
import { setupExportTools } from './ui/ExportTools.js';
import { setupFloorTabs } from './ui/FloorTabs.js';
import { setupEditorToolbar } from './ui/EditorToolbar.js';
import { setupModeSwitch } from './ui/ModeSwitch.js';
import { setupProjectControls } from './ui/ProjectControls.js';
import { setupMenuBar } from './ui/MenuBar.js';
import { setupLayerPanel } from './ui/LayerPanel.js';
import { setupTheme } from './ui/Theme.js';

const FURNITURE_PROBE = 0.3;

const savedProject = loadProject();
const project = savedProject ?? houseData;
const plan = new Plan(project);

const engine = new Engine(byId('canvas-container'));
const lighting = new Lighting(engine.scene);
const house = new House3D(engine.scene, plan);
const manager = new FurnitureManager(engine.scene);

const syncFloors = () => {
  manager.setElevations(Object.fromEntries(plan.floors.map((floor) => [floor.id, plan.elevationOf(floor)])));
  manager.setActiveFloor(plan.activeFloorId);
};
manager.setGroundResolver((floorId, x, z) => plan.elevationAt(floorId, x, z));
syncFloors();
(project.furniture ?? []).forEach(({ id, type, floor, position, rotation, color }) => {
  manager.create(type, { id, floor, position, rotation, color });
});

const selection = new Selection();
manager.on('removed', (item) => {
  if (selection.current === item) selection.clear();
});

let lastElevation = plan.elevationOf(plan.activeFloor);
plan.on('change', syncFloors);
plan.on('floor', () => {
  syncFloors();
  selection.clear();
  const elevation = plan.elevationOf(plan.activeFloor);
  const delta = elevation - lastElevation;
  lastElevation = elevation;
  engine.camera.position.y += delta;
  engine.controls.target.y += delta;
});

const canPlace = (x, z) =>
  [[0, 0], [FURNITURE_PROBE, 0], [-FURNITURE_PROBE, 0], [0, FURNITURE_PROBE], [0, -FURNITURE_PROBE]].every(
    ([dx, dz]) => plan.roomAt(plan.activeFloorId, x + dx, z + dz),
  );
const pickOther = (raycaster) => {
  const hit = house.pickDecor(raycaster, plan.activeFloorId);
  if (!hit) return null;
  return {
    item: new DecorItem({ id: hit.groupId, floorId: hit.floorId, name: hit.label, house }),
    distance: hit.distance,
  };
};
const pointer = new PointerController({ engine, manager, selection, canPlace, pickOther });

const deleteSelected = (item) => {
  if (item.kind === 'decor') {
    plan.checkpoint();
    plan.removeDecor(item.floorId, item.id);
  } else {
    manager.remove(item);
  }
};

plan.on('change', () => {
  const current = selection.current;
  if (current?.kind === 'decor' && !plan.hasDecor(current.floorId, current.id)) selection.clear();
});

window.addEventListener('keydown', (event) => {
  if (document.body.dataset.mode !== '3d' || document.body.dataset.tour === 'on' || !selection.current) return;
  if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  event.preventDefault();
  deleteSelected(selection.current);
});

const dimensions = new DimensionOverlay({
  scene: engine.scene,
  engine,
  labelsContainer: byId('labels-container'),
  manager,
  pairs: project.dimensions ?? houseData.dimensions,
});
engine.onFrame(() => {
  house.update(engine.camera);
  dimensions.update();
});

let framedKey = '';
const frameHouse = () => {
  const b = plan.bounds() ?? { minX: -3, maxX: 3, minZ: -2.6, maxZ: 2.6 };
  const key = [b.minX, b.maxX, b.minZ, b.maxZ].map((v) => v.toFixed(1)).join(',');
  if (key === framedKey) return;
  framedKey = key;

  const area = {
    center: [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
    radius: Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2,
  };
  engine.frame(area);
  lighting.fit(area);
};
frameHouse();

const editor = new PlanEditor({
  canvas: byId('plan-canvas'),
  plan,
  getFurniture: (floorId) =>
    manager
      .all()
      .filter((item) => item.floorId === floorId)
      .map((item) => ({ x: item.x, z: item.z, rotationDeg: item.rotationDeg, size: item.size })),
});

const status = new Status();
const modals = new Modals(['catalog-modal', 'room-style-modal']);

byId('house-name').textContent = plan.name;
new Inspector({ selection, manager, status, onDelete: deleteSelected });
new PlanInspector({ editor, plan });
setupFloorTabs({ plan });
setupEditorToolbar({ editor, plan });
setupLayerPanel({ editor });

const spawnPoint = () => {
  const rooms = plan.activeFloor.rooms;
  if (!rooms.length) return [0, 0];
  const largest = rooms.reduce((a, b) => (polygonArea(b.polygon) > polygonArea(a.polygon) ? b : a));
  return polygonCentroid(largest.polygon);
};
setupCatalog({ manager, selection, modals, spawnPoint });
setupRoomStyle({ plan });
setupTopBar({ engine, lighting, dimensions, editor, house });
setupExportTools({ plan, house, editor });
setupDock({ selection, status, modals });
setupMenuBar();
setupTheme({ editor });
setupModeSwitch({ editor, engine, onEnter3D: frameHouse });

const buildProject = () => ({
  ...plan.toJSON(),
  furniture: manager.toJSON(),
  dimensions: project.dimensions ?? houseData.dimensions,
});

const projectControls = setupProjectControls({
  buildProject,
  hasSavedProject: Boolean(savedProject),
  notify: (message) => editor.notify(message),
  flush: () => autosave.flush(),
});
const autosave = setupAutosave({ plan, manager, buildProject, onStatus: projectControls.setStatus });

const tourRoom = byId('tour-room');
const tour = new TourController({
  engine,
  plan,
  manager,
  house,
  selection,
  pointer,
  onChange: (active, room) => {
    document.body.dataset.tour = active ? 'on' : 'off';
    if (active) {
      const name = room?.name ?? tour.roomName;
      const level = room?.elevation ? ` · +${Math.round(room.elevation * 100)} cm` : '';
      tourRoom.textContent = name ? `${name}${level}` : 'Di luar ruangan';
    }
  },
});
byId('btn-tour').addEventListener('click', () => tour.start());
byId('btn-tour-exit').addEventListener('click', () => tour.stop());
plan.on('floor', () => tour.stop());

selection.select(manager.get('sofa'));
engine.start();

if (import.meta.env.DEV) window.__studio = { plan, editor };

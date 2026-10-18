import lSofa from './types/l-sofa.js';
import coffeeTable from './types/coffee-table.js';
import tvConsole from './types/tv-console.js';
import armchair from './types/armchair.js';
import plant from './types/plant.js';
import floorLamp from './types/floor-lamp.js';
import bedroom from './types/bedroom.js';
import kitchen from './types/kitchen.js';
import bathroom from './types/bathroom.js';
import study from './types/study.js';
import vehicle from './types/vehicle.js';

const DEFINITIONS = [
  lSofa,
  coffeeTable,
  tvConsole,
  armchair,
  plant,
  floorLamp,
  ...bedroom,
  ...kitchen,
  ...bathroom,
  ...study,
  ...vehicle,
];

const byType = new Map(DEFINITIONS.map((definition) => [definition.type, definition]));

export function getType(type) {
  const definition = byType.get(type);
  if (!definition) throw new Error(`Tipe furnitur tidak dikenal: ${type}`);
  return definition;
}

export function listCatalog() {
  return DEFINITIONS.filter((definition) => definition.catalog);
}

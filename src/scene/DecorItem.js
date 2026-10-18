import { Emitter } from '../core/Emitter.js';

export class DecorItem extends Emitter {
  kind = 'decor';

  constructor({ id, floorId, name, house }) {
    super();
    this.id = id;
    this.floorId = floorId;
    this.name = name;
    this.house = house;
  }

  setSelected(selected) {
    this.house.setDecorHighlight(this.floorId, this.id, selected);
  }
}

import { Emitter } from '../core/Emitter.js';

export class Selection extends Emitter {
  #current = null;

  get current() {
    return this.#current;
  }

  select(item) {
    if (item === this.#current) return;
    this.#current?.setSelected(false);
    this.#current = item;
    item?.setSelected(true);
    this.emit('change', item);
  }

  clear() {
    this.select(null);
  }
}

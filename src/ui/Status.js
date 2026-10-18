import { byId } from './dom.js';

const DEFAULT_TEXT = 'Klik furnitur untuk memilih, drag untuk memindahkan';

export class Status {
  constructor(elementId = 'status-text') {
    this.element = byId(elementId);
    this.reset();
  }

  set(text) {
    this.element.textContent = text;
  }

  reset() {
    this.set(DEFAULT_TEXT);
  }
}

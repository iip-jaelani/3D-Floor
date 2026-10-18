import { byId } from './dom.js';

export class Modals {
  constructor(ids) {
    this.elements = new Map(ids.map((id) => [id, byId(id)]));
    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => this.hide(button.dataset.close));
    });
  }

  toggle(id) {
    const open = this.elements.get(id).classList.contains('hidden');
    this.hideAll();
    if (open) this.elements.get(id).classList.remove('hidden');
  }

  hide(id) {
    this.elements.get(id)?.classList.add('hidden');
  }

  hideAll() {
    this.elements.forEach((element) => element.classList.add('hidden'));
  }
}

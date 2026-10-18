export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemen #${id} tidak ditemukan di index.html`);
  return element;
}

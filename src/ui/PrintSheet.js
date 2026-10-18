import { PAPERS, SCALES, buildSheet } from '../plan/sheet.js';

const PREFS_KEY = 'floor-studio:sheet';
const slug = (text) => (text || 'denah').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'denah';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function download(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printSvg(svg, paper, title) {
  const [w, h] = PAPERS[paper];
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${w}mm;height:${h}mm}</style>
    </head><body>${svg}</body></html>`;
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}

export function openPrintSheet({ plan, editor }) {
  document.getElementById('sheet-overlay')?.remove();
  const prefs = loadPrefs();
  const state = {
    paper: PAPERS[prefs.paper] ? prefs.paper : 'A3',
    scale: prefs.scale ?? 'auto',
    project: prefs.project ?? '',
    drawingNo: prefs.drawingNo ?? 'A-01',
    drafter: prefs.drafter ?? '',
  };

  const overlay = document.createElement('div');
  overlay.id = 'sheet-overlay';
  overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/60';
  const field = 'bg-black/30 border border-white/10 px-2 py-1 text-slate-100 w-full';
  overlay.innerHTML = `
    <div class="bg-[#1b1e24] border border-white/10 w-[min(1100px,96vw)] h-[min(760px,92vh)] flex flex-col text-sm text-slate-200">
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div><div class="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">Gambar kerja</div>
        <h3 class="font-bold text-white">Cetak denah</h3></div>
        <button data-x class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="flex-1 min-h-0 flex">
        <form data-form class="w-64 shrink-0 p-4 space-y-3 overflow-auto border-r border-white/10">
          <label class="block">Kertas
            <select name="paper" class="${field}">${Object.keys(PAPERS).map((p) => `<option>${p}</option>`).join('')}</select></label>
          <label class="block">Skala
            <select name="scale" class="${field}"><option value="auto">Otomatis (terbesar yang muat)</option>${SCALES.map((s) => `<option value="${s}">1:${s}</option>`).join('')}</select></label>
          <label class="block">Nama proyek
            <input name="project" class="${field}" placeholder="${plan.name ?? ''}"></label>
          <label class="block">No. gambar
            <input name="drawingNo" class="${field}"></label>
          <label class="block">Digambar oleh
            <input name="drafter" class="${field}"></label>
          <label class="block">Arah utara (derajat searah jarum jam dari atas denah; juga bisa diputar lewat kompas di denah)
            <input name="north" type="number" step="5" class="${field}"></label>
          <p data-info class="text-[11px] leading-relaxed text-slate-400"></p>
        </form>
        <div class="flex-1 min-w-0 p-4 overflow-auto bg-[#111317]"><div data-preview class="bg-white shadow-lg mx-auto max-w-full"></div></div>
      </div>
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10">
        <span class="text-[11px] text-slate-500">Di jendela cetak pilih "Simpan sebagai PDF". Matikan "Header dan footer" dan pilih skala 100% / ukuran sebenarnya.</span>
        <span class="flex gap-2">
          <button data-svg class="bg-white/10 hover:bg-white/15 px-3 py-1.5">Unduh SVG</button>
          <button data-print class="bg-sky-500/80 hover:bg-sky-500 text-white px-3 py-1.5"><i class="fa-solid fa-print mr-1"></i>Cetak / simpan PDF</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('[data-form]');
  const preview = overlay.querySelector('[data-preview]');
  const info = overlay.querySelector('[data-info]');
  Object.entries(state).forEach(([key, value]) => (form.elements[key].value = value));
  form.elements.north.value = plan.north ?? 0;

  let sheet = null;
  const options = () => ({ ...state, scale: state.scale === 'auto' ? 'auto' : Number(state.scale) });
  const render = () => {
    sheet = buildSheet(plan, plan.activeFloorId, options());
    if (!sheet) {
      preview.innerHTML = '<p class="p-6 text-slate-600">Lantai ini belum punya tembok, jadi belum ada yang bisa dicetak.</p>';
      info.textContent = '';
      return;
    }
    preview.innerHTML = sheet.svg;
    const svg = preview.querySelector('svg');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.cssText = 'display:block;width:100%;height:auto';
    info.textContent = sheet.fits
      ? `Skala 1:${sheet.scale} pada kertas ${sheet.paper}.`
      : `⚠ Denah tidak muat di skala 1:${sheet.scale} pada kertas ${sheet.paper}; bagian yang keluar terpotong. Pilih skala lebih kecil atau kertas lebih besar.`;
    info.classList.toggle('text-amber-400', !sheet.fits);
  };
  render();

  form.addEventListener('input', () => {
    Array.from(form.elements).forEach((input) => {
      if (!input.name || input.name === 'north') return;
      state[input.name] = input.value;
    });
    if (Number.isFinite(form.elements.north.valueAsNumber)) plan.setNorth(form.elements.north.valueAsNumber);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state));
    } catch {
    }
    render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  const close = () => overlay.remove();
  overlay.querySelector('[data-x]').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  overlay.querySelector('[data-print]').addEventListener('click', () => {
    if (!sheet) return editor.notify('Belum ada tembok untuk dicetak.');
    printSvg(sheet.svg, sheet.paper, `${slug(plan.name)}-${slug(plan.activeFloor.name)}-1-${sheet.scale}`);
  });
  overlay.querySelector('[data-svg]').addEventListener('click', () => {
    if (!sheet) return editor.notify('Belum ada tembok untuk diunduh.');
    download(new Blob([sheet.svg], { type: 'image/svg+xml' }), `${slug(plan.name)}-${slug(plan.activeFloor.name)}-gambar-kerja.svg`);
  });
}

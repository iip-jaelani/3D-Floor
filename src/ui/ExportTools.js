import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { toDxf } from '../plan/dxf.js';
import { DEFAULT_PRICES, estimate } from '../plan/quantities.js';
import { byId } from './dom.js';
import { openPrintSheet } from './PrintSheet.js';

const PRICES_KEY = 'floor-studio:prices';
const rupiah = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

function download(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

const slug = (text) => (text || 'denah').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'denah';

export function setupExportTools({ plan, house, editor }) {
  byId('menu-export-dxf').addEventListener('click', () => {
    const dxf = toDxf(plan, plan.activeFloorId);
    download(new Blob([dxf], { type: 'application/dxf' }), `${slug(plan.name)}-${slug(plan.activeFloor.name)}.dxf`);
    editor.notify('DXF diekspor (satuan meter, layer: DINDING, RUANGAN, BUKAAN, ATAP, HALAMAN, TANAH).', 'info');
  });

  byId('menu-print-sheet').addEventListener('click', () => openPrintSheet({ plan, editor }));

  byId('menu-export-glb').addEventListener('click', async () => {
    try {
      house.update(new THREE.PerspectiveCamera());
      const exporter = new GLTFExporter();
      const buffer = await exporter.parseAsync(house.group, { binary: true });
      download(new Blob([buffer], { type: 'model/gltf-binary' }), `${slug(plan.name)}.glb`);
      editor.notify('Model 3D (GLB) diekspor.', 'info');
    } catch (error) {
      editor.notify(`Gagal mengekspor GLB: ${error.message}`);
    }
  });

  byId('menu-rab').addEventListener('click', () => openRab());

  let prices = {};
  try {
    prices = JSON.parse(localStorage.getItem(PRICES_KEY) ?? '{}');
  } catch {
    prices = {};
  }
  const savePrices = () => {
    try {
      localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
    } catch {
    }
  };

  function openRab() {
    document.getElementById('rab-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'rab-overlay';
    overlay.className = 'fixed inset-0 z-[80] flex items-center justify-center bg-black/60';
    overlay.innerHTML = `
      <div class="bg-[#1b1e24] border border-white/10 w-[min(760px,94vw)] max-h-[88vh] flex flex-col text-sm text-slate-200">
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div><div class="text-[10px] uppercase tracking-wider text-sky-400 font-semibold">Perkiraan</div>
          <h3 class="font-bold text-white">RAB & kuantitas</h3></div>
          <button data-x class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="overflow-auto px-4 py-3" data-body></div>
        <div class="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10">
          <span class="text-[11px] text-slate-500">Harga satuan bisa diubah dan tersimpan di peramban. Perkiraan kasar, bukan penawaran.</span>
          <span class="flex gap-2">
            <button data-reset class="bg-white/10 hover:bg-white/15 px-3 py-1.5">Harga bawaan</button>
            <button data-csv class="bg-sky-500/80 hover:bg-sky-500 text-white px-3 py-1.5">Unduh CSV</button>
          </span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const body = overlay.querySelector('[data-body]');
    const render = () => {
      const { rows, total } = estimate(plan, prices);
      body.replaceChildren();
      const table = document.createElement('table');
      table.className = 'w-full';
      table.innerHTML =
        '<thead><tr class="text-left text-[10px] uppercase tracking-wider text-slate-500"><th class="py-1">Pekerjaan</th><th class="text-right">Volume</th><th></th><th class="text-right">Harga satuan</th><th class="text-right">Subtotal</th></tr></thead>';
      const tbody = document.createElement('tbody');
      rows
        .filter((r) => r.qty > 0 || r.key === 'floorArea')
        .forEach((r) => {
          const tr = document.createElement('tr');
          tr.className = 'border-t border-white/5';
          tr.innerHTML = `<td class="py-1.5">${r.label}</td><td class="text-right font-mono">${r.qty.toLocaleString('id-ID')}</td><td class="pl-1 text-slate-500">${r.unit}</td>`;
          const priceCell = document.createElement('td');
          priceCell.className = 'text-right';
          const input = document.createElement('input');
          input.type = 'number';
          input.min = 0;
          input.step = 10000;
          input.value = r.price;
          input.className = 'field-input w-28 text-right';
          input.addEventListener('change', () => {
            prices[r.key] = Math.max(parseFloat(input.value) || 0, 0);
            savePrices();
            render();
          });
          priceCell.appendChild(input);
          tr.appendChild(priceCell);
          const sub = document.createElement('td');
          sub.className = 'text-right font-mono';
          sub.textContent = rupiah(r.subtotal);
          tr.appendChild(sub);
          tbody.appendChild(tr);
        });
      table.appendChild(tbody);
      body.appendChild(table);

      const sum = document.createElement('div');
      sum.className = 'mt-3 pt-3 border-t border-white/10 flex justify-between text-base font-bold text-white';
      sum.innerHTML = `<span>Total perkiraan</span><span>${rupiah(total)}</span>`;
      body.appendChild(sum);

      const report = plan.lotReport();
      if (report) {
        const note = document.createElement('p');
        note.className = 'mt-2 text-[11px] text-slate-400';
        note.textContent = `Tanah ${report.area.toFixed(0)} m² · tapak ${report.footprint.toFixed(1)} m² · KDB ${report.kdb.toFixed(0)}% (maks ${report.kdbMax}%) · KLB ${report.klb.toFixed(2)}`;
        body.appendChild(note);
      }
    };
    render();

    const close = () => overlay.remove();
    overlay.querySelector('[data-x]').addEventListener('click', close);
    overlay.addEventListener('click', (e) => e.target === overlay && close());
    overlay.querySelector('[data-reset]').addEventListener('click', () => {
      prices = {};
      savePrices();
      render();
    });
    overlay.querySelector('[data-csv]').addEventListener('click', () => {
      const { rows, total } = estimate(plan, prices);
      const csv = [
        'Pekerjaan,Volume,Satuan,Harga satuan,Subtotal',
        ...rows.filter((r) => r.qty > 0).map((r) => `"${r.label}",${r.qty},${r.unit},${r.price},${r.subtotal}`),
        `"Total",,,,${total}`,
      ].join('\n');
      download(new Blob([csv], { type: 'text/csv' }), `${slug(plan.name)}-rab.csv`);
    });
  }
}

export { DEFAULT_PRICES };

import { clearProject, isValidProject, saveProject } from '../plan/projectStorage.js';
import { byId } from './dom.js';

const CONFIRM_MS = 3000;
const BADGES = {
  saved: { text: 'Tersimpan', class: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  saving: { text: 'Menyimpan…', class: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  error: { text: 'Gagal menyimpan', class: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  fresh: { text: 'Contoh', class: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
};

export function setupProjectControls({ buildProject, flush, hasSavedProject, notify }) {
  const badge = byId('save-badge');
  const reset = byId('btn-reset');
  const fileInput = byId('import-file');
  let resetTimer = 0;
  let confirming = false;

  const setStatus = (status) => {
    const { text, class: classes } = BADGES[status];
    badge.textContent = text;
    badge.className = `text-[10px] border px-2 py-0.5 rounded-full font-medium ${classes}`;
  };
  setStatus(hasSavedProject ? 'saved' : 'fresh');

  byId('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(buildProject(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'denah-rumah.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  byId('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      if (!isValidProject(data)) throw new Error('bentuk tidak dikenali');
      if (!saveProject(data)) throw new Error('penyimpanan browser penuh');
      location.reload();
    } catch (error) {
      notify(`Gagal membuka file: ${error.message}`);
    }
  });

  reset.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      reset.title = 'Klik lagi untuk menghapus semua perubahan';
      reset.classList.add('text-rose-300');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        confirming = false;
        reset.classList.remove('text-rose-300');
        reset.title = 'Kembali ke denah contoh';
      }, CONFIRM_MS);
      notify('Klik tombol reset sekali lagi untuk menghapus semua perubahan dan kembali ke contoh.');
      return;
    }
    clearProject();
    location.reload();
  });

  window.addEventListener('beforeunload', flush);
  return { setStatus };
}

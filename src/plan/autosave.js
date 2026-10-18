import { saveProject } from './projectStorage.js';

const DELAY_MS = 400;

export function setupAutosave({ plan, manager, buildProject, onStatus }) {
  let timer = 0;
  let pending = false;

  const write = () => {
    timer = 0;
    pending = false;
    onStatus(saveProject(buildProject()) ? 'saved' : 'error');
  };

  const schedule = () => {
    pending = true;
    onStatus('saving');
    clearTimeout(timer);
    timer = setTimeout(write, DELAY_MS);
  };

  const flush = () => {
    if (!pending) return;
    clearTimeout(timer);
    write();
  };

  plan.on('change', schedule);
  manager.on('change', schedule);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());

  return { flush };
}

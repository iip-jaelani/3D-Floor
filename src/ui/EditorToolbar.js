import { byId } from './dom.js';

export function setupEditorToolbar({ editor, plan }) {
  const tools = document.querySelectorAll('#editor-toolbar [data-tool]');
  const undo = byId('editor-undo');
  const redo = byId('editor-redo');
  const hint = byId('editor-hint');
  const toast = byId('toast');
  let toastTimer = 0;

  tools.forEach((button) => button.addEventListener('click', () => editor.setTool(button.dataset.tool)));
  undo.addEventListener('click', () => plan.undo());
  redo.addEventListener('click', () => plan.redo());
  byId('editor-fit').addEventListener('click', () => editor.fit());
  byId('editor-tidy').addEventListener('click', () => editor.tidy());
  byId('menu-clear-guides').addEventListener('click', () => editor.clearGuides());

  const syncHistory = () => {
    undo.disabled = !plan.canUndo;
    redo.disabled = !plan.canRedo;
  };
  plan.on('history', syncHistory);
  plan.on('change', syncHistory);
  syncHistory();

  editor.on('tool', (name) => {
    tools.forEach((button) => button.classList.toggle('active', button.dataset.tool === name));
  });
  editor.on('hint', (text) => (hint.textContent = text));
  editor.on('toast', ({ message, kind }) => {
    toast.textContent = message;
    toast.classList.toggle('bg-rose-500/90', kind === 'error');
    toast.classList.toggle('bg-sky-600/90', kind === 'info');
    toast.classList.remove('opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('opacity-0'), 2200);
  });

  const rulers = byId('btn-rulers');
  const grid = byId('btn-grid');
  const lines = byId('btn-lines');
  const roomColors = byId('btn-roomcolors');
  const crosshair = byId('btn-crosshair');
  crosshair.addEventListener('click', () => editor.setShowCrosshair(!editor.showCrosshair));
  const technical = byId('btn-technical');
  technical.addEventListener('click', () => editor.setShowTechnical(!editor.showTechnical));
  roomColors.addEventListener('click', () => editor.setShowRoomColors(!editor.showRoomColors));
  const syncView = () => {
    roomColors.classList.toggle('active', editor.showRoomColors);
    technical.classList.toggle('active', editor.showTechnical);
    crosshair.classList.toggle('active', editor.showCrosshair);
    rulers.classList.toggle('active', editor.showRulers);
    grid.classList.toggle('active', editor.showGrid);
    lines.classList.toggle('active', editor.lineMode);
  };
  lines.addEventListener('click', () => editor.setLineMode(!editor.lineMode));
  rulers.addEventListener('click', () => editor.setShowRulers(!editor.showRulers));
  grid.addEventListener('click', () => editor.setShowGrid(!editor.showGrid));
  editor.on('view', syncView);
  syncView();

  const cursorChip = byId('status-cursor');
  editor.on('cursor', ([x, z]) => {
    cursorChip.textContent = `X ${x.toFixed(2)}  Z ${z.toFixed(2)} m`;
  });

  editor.setTool('select');
}

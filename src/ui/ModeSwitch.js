import { byId } from './dom.js';

export function setupModeSwitch({ editor, engine, onEnter3D }) {
  const buttons = { '3d': byId('mode-3d'), '2d': byId('mode-2d') };

  const setMode = (mode) => {
    document.body.dataset.mode = mode;
    Object.entries(buttons).forEach(([key, button]) => button.classList.toggle('active', key === mode));

    if (mode === '2d') {
      engine.setPaused(true);
      editor.activate();
    } else {
      editor.deactivate();
      onEnter3D();
      engine.setPaused(false);
    }
  };

  buttons['3d'].addEventListener('click', () => setMode('3d'));
  buttons['2d'].addEventListener('click', () => setMode('2d'));
  return setMode;
}

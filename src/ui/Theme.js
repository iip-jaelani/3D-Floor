import { setPlanTheme } from '../editor/render.js';
import { byId } from './dom.js';

const THEME_KEY = 'floor-studio:theme';

export function setupTheme({ editor }) {
  const button = byId('btn-theme');

  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    setPlanTheme(theme);
    editor.requestRedraw();
    const light = theme === 'light';
    button.querySelector('i').className = light ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    button.querySelector('span').textContent = light ? 'Gelap' : 'Terang';
    button.title = light ? 'Ganti ke mode gelap' : 'Ganti ke mode terang';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
    }
  };

  button.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  apply(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
}

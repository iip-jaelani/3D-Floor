export const CAMERA = {
  fov: 40,
  position: [6.5, 6.2, 7.5],
  target: [0, 0.6, 0],
  minDistance: 3,
  maxDistance: 18,
};

export const THEMES = {
  day: {
    background: '#202227',
    ambient: 0.35,
    sun: 2.2,
    sunColor: '#fff5e6',
    warm: 0.5,
    ui: { label: 'Siang', icon: 'fa-solid fa-sun text-amber-400' },
  },
  night: {
    background: '#0f172a',
    ambient: 0.22,
    sun: 0.35,
    sunColor: '#818cf8',
    warm: 2.2,
    ui: { label: 'Malam', icon: 'fa-solid fa-moon text-indigo-400' },
  },
};

export const DRAG_MARGIN = 0.4;
export const ROTATE_STEP_DEG = 45;
export const DUPLICATE_OFFSET = 0.4;

export const FURNITURE_COLORS = [
  { hex: '#9c8f84', title: 'Warm Taupe' },
  { hex: '#475569', title: 'Slate Blue' },
  { hex: '#334155', title: 'Charcoal Dark' },
  { hex: '#d6d3d1', title: 'Cream White' },
  { hex: '#065f46', title: 'Emerald Green' },
  { hex: '#9a3412', title: 'Terracotta Leather' },
];

export const FLOOR_OPTIONS = [
  {
    id: 'oak',
    label: 'Warm Oak',
    base: '#8c6239',
    stripe: '#593a1e',
    buttonClass: 'bg-amber-900/40 border border-amber-600/40 text-amber-200 hover:bg-amber-900/60',
  },
  {
    id: 'walnut',
    label: 'Dark Walnut',
    base: '#4a3525',
    stripe: '#261910',
    buttonClass: 'bg-stone-800 border border-stone-600 text-stone-300 hover:bg-stone-700',
  },
  {
    id: 'marblewhite',
    label: 'Marmer Putih',
    base: '#f1f1ee',
    stripe: '#8e8e8a',
    buttonClass: 'bg-white text-slate-800 font-medium hover:bg-slate-100',
  },
  {
    id: 'ceramic',
    label: 'Keramik 60×60',
    base: '#d8d3c8',
    stripe: '#8d8a82',
    buttonClass: 'bg-stone-200 text-stone-800 font-medium hover:bg-stone-100',
  },
  {
    id: 'granite',
    label: 'Granit Gelap',
    base: '#3a3a3d',
    stripe: '#9a9aa0',
    buttonClass: 'bg-zinc-800 border border-zinc-600 text-zinc-200 hover:bg-zinc-700',
  },
  {
    id: 'concrete',
    label: 'Beton Poles',
    base: '#a3a3a0',
    stripe: '#7b7b78',
    buttonClass: 'bg-neutral-500/40 border border-neutral-400/40 text-neutral-100 hover:bg-neutral-500/60',
  },
  {
    id: 'marble',
    label: 'Light Tile',
    base: '#e2e8f0',
    stripe: '#cbd5e1',
    buttonClass: 'bg-slate-200 text-slate-800 font-medium hover:bg-white',
  },
];

export const WALL_COLORS = [
  { hex: '#e5e0d8', label: 'Cream', textClass: 'text-slate-800' },
  { hex: '#cbd5e1', label: 'Cool Grey', textClass: 'text-slate-800' },
  { hex: '#334155', label: 'Navy Slate', textClass: 'text-white' },
  { hex: '#d1fae5', label: 'Sage', textClass: 'text-slate-800' },
];
